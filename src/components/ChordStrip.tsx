import { useEffect, useMemo, useRef } from "react";
import { TOTAL_BEATS, chordAtBeat, transposeChord } from "@/data/song";

/*
 * ChordStrip — the strip from ~/Desktop/ui-ux-diminish/پلیر/chord-strip-lab.html
 * («نوار آکورد — مربع ۵۶×۵۶ + دیوارِ ۴px روی سرِ میزان»), ported 1:1.
 *
 * Everything is the lab's own value: 56×56 cells with a 10px radius, 5px gap,
 * a 4px wall on each bar's downbeat (clipped by the cell's radius), a 3px blue
 * "now" head that sweeps 5px → 51px inside its cell, 32px edge fades, and the
 * chord label split into root / accidental / suffix / <sup>.
 * Colours and alphas are the lab's `:root` (dark) and `:root.light` (day).
 * The only substitutions: the fade uses the surface the strip actually sits on
 * (the app's --sheet) instead of the lab's page, and the label inherits the
 * app's face — the lab's own comment says the typography is "from the project's
 * monogram (semibold + tracking-tight)", which is what these sizes carry. The cells are
 * <button>s (the app's own strip had them) with the UA box neutralised, so the look is the
 * lab's and a cell is still one tap target with an aria-label.
 */

const CELL_W = 56;
const GAP = 5;
const PITCH = CELL_W + GAP;

const CSS = `
.cs-strip{position:relative;width:100%;height:56px;overflow:hidden;
  --cs-surface:var(--sheet);
  --cs-c-rest:rgba(255,255,255,.06); --cs-c-past:rgba(255,255,255,.03);
  --cs-c-hover:rgba(255,255,255,.10); --cs-c-active:rgba(255,255,255,.15);
  --cs-hl:inset 0 1px 0 rgba(255,255,255,.08);
  --cs-sep:rgba(255,255,255,.70);
  --cs-l-past:rgba(255,255,255,.55); --cs-l-rest:rgba(255,255,255,.70); --cs-l-active:#ffffff;
  --cs-head:#0A84FF; --cs-head-glow:rgba(10,132,255,.60);}
[data-theme="day"] .cs-strip{
  --cs-c-rest:rgba(0,0,0,.05); --cs-c-past:rgba(0,0,0,.025);
  --cs-c-hover:rgba(0,0,0,.07); --cs-c-active:rgba(0,0,0,.10);
  --cs-hl:inset 0 1px 0 rgba(255,255,255,.80);
  --cs-sep:#A1A1AA;
  --cs-l-past:rgba(0,0,0,.38); --cs-l-rest:#52525B; --cs-l-active:#111111;
  --cs-head:#007AFF; --cs-head-glow:rgba(0,122,255,.45);}
.cs-scroller{height:100%;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.cs-scroller::-webkit-scrollbar{display:none}
.cs-track{position:relative;height:56px}
.cs-cell{position:absolute;top:0;height:56px;width:56px;border-radius:10px;background:var(--cs-c-rest);
  display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;
  transition:background-color .18s ease,box-shadow .18s ease;
  /* the lab's cell is a <div>; these neutralise the UA <button> box so it renders the same */
  appearance:none;-webkit-appearance:none;border:0;padding:0;margin:0;font:inherit;color:inherit;outline:none}
.cs-cell.past{background:var(--cs-c-past)}
.cs-cell.active{background:var(--cs-c-active);box-shadow:var(--cs-hl)}
.cs-cell:hover{background:var(--cs-c-hover)}
/* the lab clips the wall to the cell radius (el.style.overflow="hidden") */
.cs-cell.has-wall{overflow:hidden}
.cs-wall{position:absolute;left:0;top:0;bottom:0;width:4px;pointer-events:none;background:var(--cs-sep)}
.cs-chord{display:flex;align-items:baseline;color:var(--cs-l-rest);white-space:nowrap}
.cs-cell.past .cs-chord{color:var(--cs-l-past)}
.cs-cell.active .cs-chord{color:var(--cs-l-active)}
.cs-root{font-size:26px;font-weight:600;letter-spacing:-.025em;line-height:1}
.cs-acc{font-size:19px;font-weight:600;letter-spacing:-.02em;line-height:1}
.cs-suf{font-size:19px;font-weight:500;letter-spacing:-.01em;line-height:1;margin-left:1px}
.cs-sup{font-size:15px;font-weight:500;letter-spacing:-.01em;line-height:1;margin-left:1px;
  vertical-align:super;position:static;top:auto}
.cs-head{position:absolute;top:6px;bottom:6px;width:3px;margin-left:-1.5px;border-radius:999px;
  background:var(--cs-head);box-shadow:0 0 10px 1px var(--cs-head-glow);pointer-events:none;z-index:20}
.cs-fade{position:absolute;top:0;bottom:0;width:32px;pointer-events:none;z-index:10}
.cs-fade.cs-l{left:0;background:linear-gradient(90deg,var(--cs-surface),transparent)}
.cs-fade.cs-r{right:0;background:linear-gradient(270deg,var(--cs-surface),transparent)}
`;

/** The lab's chordHTML(): root / accidental / inline suffix / <sup> remainder. */
function Chord({ label }: { label: string }) {
  const m = label.match(/^([A-G])([#b♯♭])?(.*)$/);
  const root = m ? m[1] : label;
  const acc = m && m[2] ? m[2] : "";
  const suf = m && m[3] ? m[3] : "";
  let inline = "";
  let sup = "";
  if (suf === "m") inline = "m";
  else if (suf.startsWith("m") && !suf.startsWith("maj")) {
    inline = "m";
    sup = suf.slice(1);
  } else sup = suf;
  return (
    <span className="cs-chord" dir="ltr">
      <span className="cs-root">{root}</span>
      {acc ? <span className="cs-acc">{acc}</span> : null}
      {inline ? <span className="cs-suf">{inline}</span> : null}
      {sup ? <sup className="cs-sup">{sup}</sup> : null}
    </span>
  );
}

export function ChordStrip({ beat, semitones, onSeek }: { beat: number; semitones: number; onSeek: (beat: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);

  // The lab labels a cell only when its chord differs from the previous cell's.
  const labels = useMemo(() => {
    const out: (string | null)[] = [];
    let prev: string | null = null;
    for (let i = 0; i < TOTAL_BEATS; i++) {
      const name = transposeChord(chordAtBeat(i), semitones);
      out.push(name !== prev ? name : null);
      prev = name;
    }
    return out;
  }, [semitones]);

  const k = Math.max(0, Math.min(TOTAL_BEATS - 1, Math.floor(beat)));
  const frac = Math.max(0, Math.min(1, beat - Math.floor(beat)));

  // The lab's autoScroll(): a half-window jump, snapped to the start of a bar.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const width = sc.clientWidth || 358;
    const visible = Math.max(4, Math.floor(width / PITCH));
    const start = Math.round(sc.scrollLeft / PITCH);
    const half = Math.floor(visible / 2);
    if (k >= start + visible) {
      let snap = k - half;
      while (snap > 0 && snap % 4 !== 0) snap -= 1;
      sc.scrollTo({ left: Math.max(0, snap * PITCH - GAP), behavior: "smooth" });
    }
  }, [k]);

  return (
    <div className="cs-strip">
      <style>{CSS}</style>

      <div className="cs-scroller" ref={scroller}>
        <div className="cs-track" style={{ width: TOTAL_BEATS * PITCH - GAP }}>
          {labels.map((label, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${Math.floor(i / 4) + 1}.${(i % 4) + 1}${label ? ` — ${label}` : ""}`}
              className={`cs-cell${i < k ? " past" : i === k ? " active" : ""}${i % 4 === 0 ? " has-wall" : ""}`}
              style={{ left: i * PITCH }}
              onClick={() => onSeek(i)}
            >
              {i % 4 === 0 ? <span className="cs-wall" /> : null}
              {label ? <Chord label={label} /> : null}
            </button>
          ))}

          {/* نشانگرِ «الان» — the lab's head sweep: 5px → CELL_W-5 inside its cell */}
          <div className="cs-head" style={{ transform: `translateX(${k * PITCH + 5 + frac * (CELL_W - 10)}px)` }} />
        </div>
      </div>

      <div className="cs-fade cs-l" />
      <div className="cs-fade cs-r" />
    </div>
  );
}
