import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import type { PanelId } from "@/components/Transport";
import { BARS, CHORDS, LYRICS, SONG, TOTAL_BARS, chordAtBeat, lyricIndexAtBeat, transposeChordDef } from "@/data/song";
import { cn } from "@/lib/utils";

const PANEL_META: Record<PanelId, { label: string; hint: string }> = {
  chords: { label: "Chord diagrams", hint: "Guitar fingering for the current chord" },
  lyrics: { label: "Lyrics", hint: "Synced with playback" },
};

interface PanelHostProps {
  /** All open panels — independent switches, so several can be up at once. */
  panels: PanelId[];
  beat: number;
  playing: boolean;
  semitones: number;
  onClose: (panel: PanelId) => void;
  onSeek: (beat: number) => void;
}

/** Stable stacking order, so cards never jump around when one is toggled. */
const PANEL_ORDER: PanelId[] = ["chords", "lyrics"];

export function PanelHost(props: PanelHostProps) {
  const { panels, onClose, beat, playing } = props;
  const open = PANEL_ORDER.filter((id) => panels.includes(id));
  // Every card keeps its full height even when they stack — the stack scrolls,
  // so a tall fretboard is never squeezed into a stub.
  const cap = "min(42vh, 392px)";

  const stackRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight - el.clientHeight > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panels.length]);

  return (
    <div
      ref={stackRef}
      className="scroll-area min-h-0 overflow-y-auto overscroll-contain pr-0.5"
      style={overflowing ? { WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 22px), transparent 100%)", maskImage: "linear-gradient(to bottom, black calc(100% - 22px), transparent 100%)" } : undefined}
    >
      <div className="flex flex-col gap-2 pb-1">
        <AnimatePresence initial={false}>
          {open.map((panel) => (
            <motion.section
              key={panel}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              // A tween, not a spring: the panel's children animate their own
              // layout, and a spring chasing `height: auto` re-measures forever —
              // the sheet would never come to rest (and never become clickable).
              transition={{ duration: 0.34, ease: EASE_OUT }}
              className="shrink-0 overflow-hidden"
            >
              <div
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] transition-[max-height] duration-300"
                style={{ maxHeight: cap, background: "var(--surface)" }}
              >
                <header className="flex items-center justify-between gap-2 pl-1 pr-3" style={{ borderBottom: "0.5px solid var(--hairline)" }}>
                  <div className="flex min-w-0 items-baseline gap-2 pl-2">
                    <span className="truncate text-[15px] font-semibold">{PANEL_META[panel].label}</span>
                    <span className="hidden truncate text-[12px] text-[var(--fg-3)] sm:inline">{PANEL_META[panel].hint}</span>
                  </div>
                  <motion.button
                    type="button"
                    aria-label={`Close ${PANEL_META[panel].label}`}
                    onClick={() => onClose(panel)}
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING_PRESS}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-2)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--fg)]"
                  >
                    <X className="size-[18px]" />
                  </motion.button>
                </header>

                <div className="min-h-0 flex-1" style={{ maxHeight: `calc(${cap} - 44px)` }}>
                  {panel === "chords" ? <FretboardPanel beat={beat} playing={playing} semitones={props.semitones} /> : null}
                  {panel === "lyrics" ? <LyricsPanel beat={beat} /> : null}
                </div>
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Chord diagrams
 * ------------------------------------------------------------------ */

function FretboardPanel({ beat, playing, semitones }: { beat: number; playing: boolean; semitones: number }) {
  const liveChord = chordAtBeat(beat);
  const songChords = useMemo(() => Array.from(new Set(BARS.flatMap((b) => b.changes.map(([, c]) => c)))), []);
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = pinned ?? liveChord;
  const def = transposeChordDef(CHORDS[shown] ?? CHORDS.Am7, semitones);
  const nextChange = useMemo(() => {
    for (let b = Math.ceil(beat); b < TOTAL_BARS * 4; b++) {
      const c = chordAtBeat(b);
      const atBar = Math.floor(b / 4);
      if (BARS[atBar].changes.some(([at, name]) => at === b % 4 && name === c) && c !== liveChord) return c;
    }
    return null;
  }, [beat, liveChord]);

  const frets = def.shape;
  const maxFret = Math.max(0, ...frets.filter((f) => f > 0));
  const shifted = maxFret > 5;
  const baseFret = shifted ? maxFret - 4 : 0;
  const shownFrets = frets.map((f) => (f > 0 ? f - baseFret : f));
  const width = 232;
  const height = 250;
  const padX = 22;
  const padTop = 38;
  const padBottom = 26;
  const stringGap = (width - padX * 2) / 5;
  const fretGap = (height - padTop - padBottom) / 5;
  const dotFor = (stringIndex: number, fretValue: number) => ({
    x: padX + stringIndex * stringGap,
    y: padTop + (fretValue - 0.5) * fretGap,
  });

  const dots = shownFrets
    .map((fret, i) => ({ string: i, fret, ...(fret > 0 ? dotFor(i, fret) : { x: 0, y: 0 }) }))
    .filter((d) => d.fret > 0);

  const fingerOf = (stringIndex: number) => {
    const value = def.fingers[stringIndex];
    return value > 0 ? value : null;
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{pinned ? "Preview" : "Playing"}</span>
          {!pinned && playing ? (
            <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-[var(--fg)]" style={{ background: "var(--fill)" }}>
              <span className="size-1.5 animate-pulse rounded-full bg-current" /> Live
            </span>
          ) : null}
        </div>
        {pinned ? (
          <button type="button" onClick={() => setPinned(null)} className="text-[12px] text-[var(--fg-2)] underline decoration-dotted">
            Back to live playback
          </button>
        ) : (
          <span className="text-[12px] text-[var(--fg-3)]">Next: {nextChange ? transposeChordDef(CHORDS[nextChange], semitones).name : "—"}</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-4">
        <div className="shrink-0">
          <div className="mb-1 text-center text-[15px] font-semibold">{def.name}</div>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Chord diagram ${def.name}`} dir="ltr">
            {baseFret > 0 ? (
              <text x={4} y={padTop + fretGap * 0.7} className="fill-[var(--muted-fg)]" fontSize="10" fontFamily="ui-monospace">
                {baseFret + 1}
              </text>
            ) : (
              <rect x={padX - 1} y={padTop - 5} width={width - padX * 2 + 2} height={5} rx={2.5} fill="var(--fg)" opacity={0.85} />
            )}

            {/* frets */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line key={i} x1={padX} x2={width - padX} y1={padTop + i * fretGap} y2={padTop + i * fretGap} stroke="var(--hairline-2)" strokeWidth={1.2} />
            ))}

            {/* strings */}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i} x1={padX + i * stringGap} x2={padX + i * stringGap} y1={padTop} y2={height - padBottom} stroke="var(--hairline-2)" strokeWidth={1 + (5 - i) * 0.12} />
            ))}

            {/* barre */}
            {def.barre ? (
              <motion.rect
                layout
                x={padX + def.barre[1] * stringGap - 7}
                y={padTop + (def.barre[0] - baseFret - 0.5) * fretGap - 7}
                width={(def.barre[2] - def.barre[1]) * stringGap + 14}
                height={14}
                rx={7}
                fill="var(--fg)" opacity={0.95}
                opacity={0.9}
              />
            ) : null}

            {/* dots */}
            <AnimatePresence>
              {dots.map((d) => (
                <motion.g
                  key={`${d.string}`}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1, x: d.x - 11, y: d.y - 11 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  style={{ originX: "11px", originY: "11px" }}
                >
                  <circle cx={11} cy={11} r={11} fill="var(--fg)" />
                  {fingerOf(d.string) ? (
                    <text x={11} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--bg)" fontFamily="ui-monospace">
                      {fingerOf(d.string)}
                    </text>
                  ) : null}
                </motion.g>
              ))}
            </AnimatePresence>

            {/* open / muted markers */}
            {shownFrets.map((f, i) => (
              <text
                key={`m-${i}`}
                x={padX + i * stringGap}
                y={padTop - 12}
                textAnchor="middle"
                fontSize="11"
                fill={f === 0 ? "var(--fg)" : "var(--muted-fg)"}
                opacity={f === 0 ? 0.95 : 0.6}
                fontFamily="inherit"
              >
                {f === 0 ? "o" : f < 0 ? "×" : ""}
              </text>
            ))}
          </svg>
        </div>

        <div
          className="scroll-area flex max-h-full min-w-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto"
          style={{ WebkitMaskImage: "linear-gradient(to bottom, black 82%, transparent 100%)", maskImage: "linear-gradient(to bottom, black 82%, transparent 100%)" }}
        >
          {songChords.map((name) => {
            const transposed = transposeChordDef(CHORDS[name], semitones).name;
            const active = (pinned ?? liveChord) === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setPinned(name)}
                className={cn(
                  "min-h-9 rounded-lg border px-3 text-[12px] transition-colors",
                  active ? "border-transparent text-[var(--fg)]" : "border-[var(--hairline)] text-[var(--fg-2)] hover:text-[var(--fg)]",
                )}
                style={{ background: active ? "var(--fill)" : undefined }}
              >
                {transposed}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Lyrics
 * ------------------------------------------------------------------ */

function LyricsPanel({ beat }: { beat: number }) {
  const activeIndex = lyricIndexAtBeat(beat);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const firstScroll = useRef(true);
  useEffect(() => {
    const el = lineRefs.current[activeIndex];
    const container = containerRef.current;
    if (!el || !container) return;
    const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    // Jump on the first paint (the panel was just opened), glide afterwards.
    container.scrollTo({ top, behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="scroll-area h-full overflow-y-auto px-4 py-4" dir="ltr">
      <div className="mx-auto flex max-w-md flex-col gap-4 pb-16">
        {LYRICS.map((line, i) => {
          const active = i === activeIndex;
          const passed = i < activeIndex;
          return (
            <div
              key={line.beat}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              className="relative"
            >
              <motion.p
                animate={{
                  opacity: active ? 1 : passed ? 0.34 : 0.5,
                  scale: active ? 1 : 0.94,
                  filter: active ? "blur(0px)" : "blur(0.6px)",
                }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className={cn("origin-left text-[17px] leading-snug", active ? "text-[20px] font-bold text-[var(--fg)]" : "text-[var(--fg)]")}
              >
                {line.text}
              </motion.p>
              {active ? (
                <motion.span layoutId="lyric-bar" className="absolute -left-3 top-1 h-5 w-[3px] rounded-full bg-[var(--fg)]" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
