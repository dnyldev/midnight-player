import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { FastForward, LayoutGrid, ListMusic, Pause, Play, Rewind, SlidersHorizontal } from "lucide-react";
import { NumberTicker } from "@/components/beui/number-ticker";
import { SPRING_PRESS } from "@/lib/ease";
import { formatTime } from "@/hooks/useTransport";
import { TOTAL_BEATS, transposeChord } from "@/data/song";

export type PanelId = "chords" | "lyrics";
/** Everything the dock row can act on — panels stack in the sheet, the mixer is its own drawer. */
export type DockId = PanelId | "mixer";

const PANELS: { id: DockId; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "chords", label: "دیاگرام آکوردها", Icon: LayoutGrid },
  { id: "lyrics", label: "متن آهنگ", Icon: ListMusic },
  { id: "mixer", label: "میکسر", Icon: SlidersHorizontal },
];

interface TransportProps {
  playing: boolean;
  beat: number;
  bpm: number;
  semitones: number;
  secPerBeat: number;
  /** Every open panel — the toggles are independent, so this is a set. */
  panels: PanelId[];
  /** The mixer lives in its own bottom drawer, matching tempo and key. */
  mixerOpen: boolean;
  onToggle: () => void;
  onSeek: (beat: number) => void;
  onSkip: (seconds: number) => void;
  onPanel: (panel: DockId) => void;
  onOpenTempo: () => void;
  onOpenKey: () => void;
}

export function Transport({
  playing,
  beat,
  bpm,
  semitones,
  secPerBeat,
  panels,
  mixerOpen,
  onToggle,
  onSeek,
  onSkip,
  onPanel,
  onOpenTempo,
  onOpenKey,
}: TransportProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [ghostBeat, setGhostBeat] = useState(0);

  const progress = useMotionValue(0);
  const smooth = useSpring(progress, { stiffness: 300, damping: 40, mass: 0.4 });
  const shown = scrubbing ? progress : smooth;
  const fillScale = useTransform(shown, (v) => Math.min(1, Math.max(0, v)));

  useEffect(() => {
    if (!scrubbing) progress.set(beat / TOTAL_BEATS);
  }, [beat, scrubbing, progress]);

  const beatFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * TOTAL_BEATS;
  };

  const playedBeat = scrubbing ? ghostBeat : beat;

  return (
    <div className="flex flex-col gap-3 px-4 pt-2" style={{ paddingBottom: "max(12px, calc(var(--safe-b) + 6px))" }}>
      {/* scrubber — hairline track, solid ink fill, no knob until touched */}
      <div className="flex items-center gap-3" dir="ltr">
        <span className="w-9 shrink-0 text-[12px] tabular-nums text-[var(--fg-2)]">{formatTime(playedBeat * secPerBeat)}</span>
        <div
          ref={trackRef}
          role="slider"
          aria-label="جای پخش"
          aria-valuemin={0}
          aria-valuemax={Math.round(TOTAL_BEATS)}
          aria-valuenow={Math.round(playedBeat)}
          tabIndex={0}
          className="group relative h-11 flex-1 cursor-pointer touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbing(true);
            const b = beatFromPointer(e.clientX);
            setGhostBeat(b);
            progress.set(b / TOTAL_BEATS);
          }}
          onPointerMove={(e) => {
            if (!scrubbing) return;
            const b = beatFromPointer(e.clientX);
            setGhostBeat(b);
            progress.set(b / TOTAL_BEATS);
          }}
          onPointerUp={(e) => {
            const b = beatFromPointer(e.clientX);
            setScrubbing(false);
            onSeek(b);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onSkip(-5);
            if (e.key === "ArrowRight") onSkip(5);
          }}
        >
          <div className="absolute top-1/2 h-[4px] w-full -translate-y-1/2 overflow-hidden rounded-full" style={{ background: "var(--fill)" }}>
            <motion.div className="h-full w-full origin-left rounded-full" style={{ scaleX: fillScale, background: "var(--fg)" }} />
          </div>
          <motion.span
            className="absolute top-1/2 size-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{ left: useTransform(fillScale, (v) => `${v * 100}%`), background: "var(--fg)" }}
            animate={{ opacity: scrubbing ? 1 : 0, scale: scrubbing ? 1.2 : 1 }}
            transition={{ duration: 0.16 }}
          />
        </div>
        <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-[var(--fg-2)]">{formatTime(TOTAL_BEATS * secPerBeat)}</span>
      </div>

      {/* panel toggles — independent switches, not tabs: any combination is legal */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: "var(--fill)" }}>
          {PANELS.map(({ id, label, Icon }) => {
            const active = id === "mixer" ? mixerOpen : panels.includes(id);
            return (
              <motion.button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => onPanel(id)}
                whileTap={{ scale: 0.9 }}
                transition={SPRING_PRESS}
                className="grid size-11 place-items-center rounded-full transition-colors"
                style={{ background: active ? "var(--fg)" : "transparent", color: active ? "var(--bg)" : "var(--fg-2)" }}
              >
                <Icon className="size-[18px]" />
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* transport — the chips take the corners, the transport keeps the middle */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pt-0.5" dir="ltr">
        <CornerStat
          className="justify-self-start"
          align="start"
          aria-label="تمپو"
          value={<NumberTicker value={bpm} startOnView={false} duration={0.5} className="text-[24px] font-semibold leading-none tracking-[-0.01em] tabular-nums" />}
          label="BPM"
          onClick={onOpenTempo}
        />

        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            aria-label="عقب ۵ ثانیه"
            onClick={() => onSkip(-5)}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_PRESS}
            className="grid size-12 place-items-center rounded-full text-[var(--fg)]"
          >
            <Rewind className="size-[28px]" fill="currentColor" strokeWidth={0.5} />
          </motion.button>

          <motion.button
            type="button"
            aria-label={playing ? "توقف" : "پخش"}
            onClick={onToggle}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_PRESS}
            className="relative grid size-[64px] place-items-center rounded-full"
            style={{ background: "var(--fg)", color: "var(--bg)", boxShadow: "var(--shadow-float)" }}
          >
            {playing ? <Pause className="size-[24px]" fill="currentColor" /> : <Play className="size-[24px] translate-x-[1.5px]" fill="currentColor" />}
          </motion.button>

          <motion.button
            type="button"
            aria-label="جلو ۵ ثانیه"
            onClick={() => onSkip(5)}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_PRESS}
            className="grid size-12 place-items-center rounded-full text-[var(--fg)]"
          >
            <FastForward className="size-[28px]" fill="currentColor" strokeWidth={0.5} />
          </motion.button>
        </div>

        <CornerStat
          className="justify-self-end"
          align="end"
          aria-label="گام"
          value={<span className="text-[24px] font-semibold leading-none tracking-[-0.01em]">{transposeChord("A", semitones)}m</span>}
          label="KEY"
          onClick={onOpenKey}
        />
      </div>
    </div>
  );
}

function CornerStat({
  value,
  label,
  align,
  onClick,
  className,
  ...props
}: {
  value: React.ReactNode;
  label: string;
  align: "start" | "end";
  onClick: () => void;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={SPRING_PRESS}
      className={`flex min-h-11 flex-col justify-center gap-2 ${align === "start" ? "items-start pl-6" : "items-end pr-6"} ${className ?? ""}`}
      {...props}
    >
      <span className="text-[24px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-[var(--fg)]">{value}</span>
      <span className="text-[13px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--fg-2)]">{label}</span>
    </motion.button>
  );
}

