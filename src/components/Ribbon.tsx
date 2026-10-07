import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/beui/tabs";
import { SPRING_GLIDE } from "@/lib/ease";
import {
  BARS,
  CHANGES,
  STRUM,
  SONG,
  TOTAL_BARS,
  TOTAL_BEATS,
  chordAtBeat,
  transposeChord,
} from "@/data/song";
import { cn } from "@/lib/utils";

export type RibbonMode = "follow" | "map";

const CELL_GAP = 6;
const BAR_GAP = 26;
const STRIP_PAD = 6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ *
 *  Static grid of bars — memoized so the 30fps playhead never touches
 *  the 400-odd cells underneath it.
 * ------------------------------------------------------------------ */

const ChordGrid = memo(function ChordGrid({
  cellW,
  chordFontSize,
  semitones,
  onSeek,
}: {
  cellW: number;
  chordFontSize: number;
  semitones: number;
  onSeek: (beat: number) => void;
}) {
  const barPitch = cellW * 4 + CELL_GAP * 3 + BAR_GAP;
  return (
    <div className="flex items-center" style={{ gap: BAR_GAP }}>
      {BARS.map((bar) => (
        <div key={bar.index} className="relative flex shrink-0 items-center" style={{ gap: CELL_GAP, width: barPitch - BAR_GAP }}>
          {/* bar divider, centred in the gap before the next bar */}
          <span aria-hidden className="pointer-events-none absolute -right-[13px] top-1/2 h-7 w-px -translate-y-1/2" style={{ background: "var(--hairline-2)" }} />

          {[0, 1, 2, 3].map((beatInBar) => {
            const change = bar.changes.find(([at]) => at === beatInBar);
            const chordName = change ? transposeChord(change[1], semitones) : null;
            const secondary = change && beatInBar !== 0;
            const globBeat = bar.index * 4 + beatInBar;
            return (
              <button
                key={beatInBar}
                type="button"
                onClick={() => onSeek(globBeat)}
                style={{ width: cellW, height: cellW }}
                className={cn(
                  "group relative flex flex-col items-center justify-center rounded-[14px] border p-0 transition-colors",
                  "border-[var(--hairline)] bg-[var(--surface-2)] hover:border-[var(--hairline-2)]",
                  chordName && secondary ? "bg-[var(--tint)]" : "",
                )}
                aria-label={`${bar.index + 1}.${beatInBar + 1}${chordName ? ` — ${chordName}` : ""}`}
              >
                <span className="absolute left-1.5 top-1 text-[10px] tabular-nums text-[var(--fg-3)]">{beatInBar + 1}</span>

                {chordName ? (
                  <span
                    className={cn("px-0.5 text-center font-medium leading-tight tracking-[-0.02em]", "text-[var(--fg)]")}
                    style={{ fontSize: chordFontSize }}
                  >
                    {chordName}
                  </span>
                ) : (
                  <span className="size-1.5 rounded-full" style={{ background: "var(--fg-3)", opacity: 0.5 }} />
                )}

                {/* eighth-note strum ticks */}
                <span className="absolute bottom-1.5 flex items-center gap-1">
                  {[beatInBar * 2, beatInBar * 2 + 1].map((slot) => {
                    const mark = STRUM[slot];
                    return (
                      <span
                        key={slot}
                        className="text-[8px] leading-none"
                        style={{ color: "var(--fg-3)", opacity: mark === "D" ? 0.9 : mark === "U" ? 0.6 : 0.25 }}
                      >
                        {mark || "·"}
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});

/* ------------------------------------------------------------------ *
 *  The ribbon itself
 * ------------------------------------------------------------------ */

interface RibbonProps {
  beat: number;
  playing: boolean;
  semitones: number;
  mode: RibbonMode;
  /** Hide the helper caption when a panel is occupying the lower half. */
  compact: boolean;
  onModeChange: (mode: RibbonMode) => void;
  onSeek: (beat: number) => void;
}

export function Ribbon({ beat, playing, semitones, mode, compact, onModeChange, onSeek }: RibbonProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 148 });

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox((prev) =>
        Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const width = box.w;

  /**
   * Layout math
   * -----------
   * One bar = four beat cells + hairline gaps. The ribbon is twice as wide as
   * the viewport is split at the playhead: half a screen of *history* sits to
   * its left, the bar being played travels across the right half, and when it
   * reaches the edge the whole strip glides back one bar so the next bar
   * arrives from off-screen. That is the "chord chart" reading motion: cells
   * are never static under the marker, and the marker always sweeps a full
   * half-screen per bar.
   */
  // One bar should own ~80% of the screen width: the marker sweeps almost the
  // full width per bar (tick… tick… tick…), the played bar stays readable in
  // one piece, and whatever is left on the right is the next bar arriving.
  const fromWidth = (width * 0.8 - CELL_GAP * 3 - BAR_GAP) / 4;
  // When the ribbon owns the leftover space on a tall screen, the cells grow
  // with the box instead of leaving a void above and below the staff.
  const fromHeight = compact ? Infinity : box.h * 0.44;
  const cellW = Math.round(clamp(Math.min(fromWidth, fromHeight), 40, 104));
  const barPitch = cellW * 4 + CELL_GAP * 3 + BAR_GAP;
  const leadX = clamp(width * 0.12, 26, 92); // marker's home position from bar 2 on
  const chordFontSize = Math.round(clamp(cellW * 0.3, 11, 20));

  const beatMV = useMotionValue(beat);
  const stripTarget = useMotionValue(0);
  const strip = useSpring(stripTarget, { stiffness: 120, damping: 20, mass: 0.85 });

  useEffect(() => {
    beatMV.set(beat);
    const page = Math.max(0, Math.floor(beat / 4));
    // Bar 1 starts flush left so nothing is wasted at the top of the song. From
    // then on every bar reset pulls the ribbon back one bar-length, leaving a
    // sliver of the previous bar as history behind the marker.
    stripTarget.set(page === 0 ? STRIP_PAD : leadX + STRIP_PAD - page * barPitch);
  }, [beat, beatMV, stripTarget, leadX, barPitch]);

  // Playhead rides the *animated* strip, so during a flip the marker and the
  // cells travel together and it always sits over the true beat.
  const playheadX = useTransform([strip, beatMV], ([s, b]: [number, number]) => s + (b / 4) * barPitch + 1.5);

  const activeCellX = useTransform([strip, beatMV], ([s, b]: [number, number]) => {
    const index = Math.floor(b);
    const barIndex = Math.floor(index / 4);
    const inBar = index % 4;
    return s + barIndex * barPitch + inBar * (cellW + CELL_GAP);
  });

  const stripWidth = TOTAL_BARS * barPitch;
  // The transport can read marginally before the scheduled start (or after the
  // tail), so the display beat is clamped into the song before it indexes BARS.
  const safeBeat = Number.isFinite(beat) ? clamp(beat, 0, TOTAL_BEATS - 0.001) : 0;
  const currentChord = transposeChord(chordAtBeat(safeBeat), semitones);
  const nextChange = useMemo(() => CHANGES.find((c) => c.beat > safeBeat + 0.02), [safeBeat]);
  const nextChord = nextChange ? transposeChord(nextChange.chord, semitones) : "—";
  const currentBarNumber = Math.min(TOTAL_BARS, Math.floor(safeBeat / 4) + 1);
  const section = (BARS[Math.min(TOTAL_BARS - 1, Math.floor(safeBeat / 4))] ?? BARS[0]).section;
  const beatInBar = Math.floor(safeBeat) % 4;
  const progress = safeBeat / TOTAL_BEATS;

  return (
    <section className={compact ? "flex flex-1 flex-col gap-2" : "flex flex-1 flex-col gap-3"} style={{ minHeight: compact ? cellW + 20 : 126 }}>
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] text-[var(--fg-2)]">نوار آکورد</span>
          <span className="text-[12px] text-[var(--fg-3)]">
            <span className="text-[var(--fg-2)]">{section}</span>
            <span className="mx-1.5">·</span>
            <span className="tabular-nums">{currentBarNumber}</span>
            <span>/{TOTAL_BARS}</span>
          </span>
        </div>

        <Tabs variant="segment" value={mode} onValueChange={(v) => onModeChange(v as RibbonMode)} className="shrink-0">
          <TabsList className="border border-[var(--hairline)]">
            <TabsTrigger value="follow" className="h-11 gap-1 px-3 text-[11px]">
              <Minimize2 className="size-3" />
              پیشرو
            </TabsTrigger>
            <TabsTrigger value="map" className="h-11 gap-1 px-3 text-[11px]">
              <Maximize2 className="size-3" />
              نقشهی آهنگ
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--hairline)]"
        style={compact ? { height: cellW + 12 } : { minHeight: 102, maxHeight: "42vh", flex: "1 1 auto" }}
      >
        {/* section wash — the tiniest hint that a section is running */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="absolute inset-x-0 top-0 h-8" style={{ background: "linear-gradient(to bottom, var(--fill), transparent)" }} />
        </div>
        {mode === "follow" ? (
          <>
            <div ref={viewportRef} className="relative h-full overflow-hidden" dir="ltr">
              <motion.div style={{ x: strip, width: stripWidth }} className="absolute top-1/2 -translate-y-1/2 will-change-transform">
                <ChordGrid cellW={cellW} chordFontSize={chordFontSize} semitones={semitones} onSeek={onSeek} />
              </motion.div>

              {/* active cell bracket */}
              <motion.div
                aria-hidden
                style={{ x: activeCellX, width: cellW, height: cellW, top: "50%", marginTop: -cellW / 2 }}
                className="pointer-events-none absolute left-0 rounded-[14px] ring-[1.5px] ring-[var(--fg)]"
              />

              {/* playhead */}
              <motion.div aria-hidden style={{ x: playheadX }} className="pointer-events-none absolute inset-y-0 left-0">
                <div className="relative h-full w-px" style={{ background: "linear-gradient(to bottom, transparent, var(--fg) 16%, var(--fg) 84%, transparent)", opacity: 0.9 }}>
                  <span className="absolute -left-[3px] top-1/2 size-[7px] -translate-y-1/2 rounded-full" style={{ background: "var(--fg)" }} />
                  {playing ? <span className="pulse-ring absolute -left-[10px] top-1/2 size-[21px] -translate-y-1/2 rounded-full border" style={{ borderColor: "var(--fg)", opacity: 0.4 }} /> : null}
                </div>
              </motion.div>

              {/* edge fades */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10" style={{ background: "linear-gradient(to right, var(--bg), transparent)" }} />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-14" style={{ background: "linear-gradient(to left, var(--bg), transparent)" }} />
            </div>
            {compact ? null : (
              <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-[var(--fg-3)]">
                روی هر خانه بزن تا از همان ضرب پخش شود
              </p>
            )}
          </>
        ) : (
          <SongMap beat={beat} onSeek={onSeek} semitones={semitones} />
        )}
      </div>

      {/* readout — the panel already spells the chord out, so while it is open
          this collapses to one calm line and hands the height to the panel. */}
      <footer className={cn("flex items-center justify-between gap-3 px-1", compact && "py-0")}>
        <div className="flex items-center gap-3">
          <motion.div
            key={currentChord}
            initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={cn("font-bold text-[var(--fg)]", compact ? "text-[20px]" : "text-[28px]")}
          >
            {currentChord}
          </motion.div>
          {compact ? null : (
            <div className="flex flex-col">
              <span className="text-[11px] text-[var(--fg-3)]">بعدی</span>
              <span className="text-[13px] text-[var(--fg-2)]">{nextChord}</span>
            </div>
          )}
        </div>

        {compact ? null : (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                animate={{
                  scale: i === beatInBar ? 1.5 : 1,
                  opacity: i === beatInBar ? 1 : 0.28,
                  backgroundColor: i === beatInBar ? "var(--fg)" : "var(--fg-3)",
                }}
                transition={SPRING_GLIDE}
                className="size-1.5 rounded-full"
              />
            ))}
          </div>
          <span className="text-[11px] tabular-nums text-[var(--fg-3)]">{Math.round(progress * 100)}%</span>
        </div>
        )}
      </footer>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 *  Song map — the whole arrangement on one line
 * ------------------------------------------------------------------ */

function SongMap({ beat, onSeek, semitones }: { beat: number; onSeek: (beat: number) => void; semitones: number }) {
  const sections = useMemo(() => {
    const out: { name: string; from: number; to: number }[] = [];
    for (const bar of BARS) {
      const last = out[out.length - 1];
      if (last && last.name === bar.section) last.to = bar.index;
      else out.push({ name: bar.section, from: bar.index, to: bar.index });
    }
    return out;
  }, []);

  const firstChanges = useMemo(() => {
    const seen = new Set<string>();
    return CHANGES.filter((c) => {
      if (seen.has(c.chord)) return true;
      seen.add(c.chord);
      return true;
    });
  }, []);

  return (
    <div className="flex h-full flex-col justify-center gap-4 p-4" dir="rtl">
      <div className="relative h-8" dir="ltr">
        <div className="absolute inset-0 flex gap-1" dir="ltr">
          {sections.map((s) => {
            const span = s.to - s.from + 1;
            const active = beat / 4 >= s.from && beat / 4 < s.to + 1;
            return (
              <button
                key={s.name + s.from}
                type="button"
                onClick={() => onSeek(s.from * 4)}
                style={{ flex: span, background: active ? "var(--fill)" : undefined }}
                className={cn(
                  "relative overflow-hidden rounded-xl border text-[10px] font-medium tracking-widest transition-colors",
                  active
                    ? "border-transparent text-[var(--fg)]"
                    : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--fg-2)] hover:text-[var(--fg)]",
                )}
              >
                {span > 2 ? s.name : ""}
              </button>
            );
          })}
        </div>
        <motion.span
          className="pointer-events-none absolute -top-1 bottom-[-4px] w-px bg-[var(--fg)]"
          style={{ left: `${(beat / TOTAL_BEATS) * 100}%` }}
          transition={{ duration: 0.12, ease: "linear" }}
        />
      </div>

      {/* beat ruler */}
      <div className="relative" dir="ltr">
        <div className="flex h-6 items-end gap-[1px]">
          {Array.from({ length: TOTAL_BEATS }, (_, i) => {
            const active = Math.floor(beat) >= i;
            const isBar = i % 4 === 0;
            return (
              <span
                key={i}
                style={{ height: isBar ? 18 : 9 }}
                className="flex-1 rounded-sm"
                style={{ background: "var(--fg)", opacity: active ? (isBar ? 0.85 : 0.35) : isBar ? 0.28 : 0.12 }}
              />
            );
          })}
        </div>
      </div>

      {/* chord change list */}
      <div className="scroll-area flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" dir="ltr">
        {firstChanges.map((c, i) => {
          const active = beat >= c.beat - 0.02 && (!firstChanges[i + 1] || beat < firstChanges[i + 1].beat + 8);
          return (
            <button
              key={`${c.beat}-${c.chord}`}
              type="button"
              onClick={() => onSeek(c.beat)}
              style={{ background: active ? "var(--fill)" : undefined }}
              className={cn(
                "rounded-lg border px-2 py-1 text-[11px] transition-colors",
                active ? "border-transparent text-[var(--fg)]" : "border-[var(--hairline)] text-[var(--fg-2)] hover:text-[var(--fg)]",
              )}
            >
              {transposeChord(c.chord, semitones)}
              <span className="ml-1.5 tabular-nums opacity-60">{c.bar + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
