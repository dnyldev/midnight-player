import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { motion } from "motion/react";
import { Drum, Guitar, Mic, MoreHorizontal, Piano, Waves, type LucideIcon } from "lucide-react";
import { Slider } from "@appica/ui-react/slider";
import { BottomSheet } from "@/components/beui/bottom-sheet";
import { NumberTicker } from "@/components/beui/number-ticker";
import { EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { SONG, STEMS, type StemId } from "@/data/song";
import type { MixState } from "@/hooks/useTransport";

/* ==================================================================== *
 *  Tempo drawer — ported from the user's own "Tempo control" design:
 *  a huge tabular readout over a draggable tick ruler, teal needle.
 * ==================================================================== */

const T_MIN = 60;
const T_MAX = 200;
const T_PITCH = 20;   // px between two BPM ticks
const T_SNAP = 280;   // ms — settle animation
const T_NEAR = 4.5;   // "this tick is the value" threshold

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function TempoSheet({
  open,
  onOpenChange,
  bpm,
  onBpm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bpm: number;
  onBpm: (value: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(bpm);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const center = useRef(0);
  const offsetRef = useRef(0);
  const valueRef = useRef(bpm);
  const raf = useRef(0);
  const drag = useRef({ active: false, startX: 0, startOffset: 0, lastX: 0, lastT: 0, v: 0 });

  const valueAt = (o: number, c: number) => T_MIN + (c - T_PITCH / 2 - o) / T_PITCH;
  const offsetFor = (v: number, c: number) => c - (v - T_MIN) * T_PITCH - T_PITCH / 2;
  const bounds = (c: number) => ({ minO: c - (T_MAX - T_MIN) * T_PITCH - T_PITCH / 2, maxO: c - T_PITCH / 2 });

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const commit = useCallback(
    (v: number) => {
      const next = clamp(Math.round(v), T_MIN, T_MAX);
      valueRef.current = next;
      setValue(next);
      onBpm(next);
      return next;
    },
    [onBpm],
  );

  /** cubic-ease glide of the strip to the tick of `target` */
  const settle = useCallback(
    (target: number) => {
      stop();
      const from = offsetRef.current;
      const to = offsetFor(target, center.current);
      const t0 = performance.now();
      const step = (now: number) => {
        const p = clamp((now - t0) / T_SNAP, 0, 1);
        const o = from + (to - from) * easeOutCubic(p);
        offsetRef.current = o;
        setOffset(o);
        setValue(valueAt(o, center.current));
        if (p < 1) raf.current = requestAnimationFrame(step);
        else {
          offsetRef.current = to;
          setOffset(to);
          commit(target);
        }
      };
      raf.current = requestAnimationFrame(step);
    },
    [commit, stop],
  );

  const snap = useCallback(() => settle(clamp(Math.round(valueAt(offsetRef.current, center.current)), T_MIN, T_MAX)), [settle]);

  /** flick → keep gliding, friction 0.92, then settle on the nearest tick */
  const momentum = useCallback(() => {
    stop();
    let v = drag.current.v * 16;
    if (Math.abs(v) < 0.1) return snap();
    const { minO, maxO } = bounds(center.current);
    const step = () => {
      v *= 0.92;
      if (Math.abs(v) < 0.15) return snap();
      let o = offsetRef.current + v;
      if (o <= minO) {
        o = minO;
        v = 0;
      }
      if (o >= maxO) {
        o = maxO;
        v = 0;
      }
      offsetRef.current = o;
      setOffset(o);
      setValue(valueAt(o, center.current));
      if (o === minO || o === maxO) return snap();
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [snap, stop]);

  // measure the rail, park the strip on the current bpm
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = railRef.current;
      if (!el) return;
      const c = window.innerWidth / 2 - el.getBoundingClientRect().left;
      center.current = c;
      const o = offsetFor(valueRef.current, c);
      offsetRef.current = o;
      setOffset(o);
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (railRef.current) ro.observe(railRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [open]);

  // the transport can move the bpm too (keyboard shortcuts) — follow it when idle
  useEffect(() => {
    if (drag.current.active) return;
    if (valueRef.current === bpm) return;
    valueRef.current = bpm;
    setValue(bpm);
    if (center.current) settle(bpm);
  }, [bpm, settle]);

  useEffect(() => stop, [stop]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    stop();
    drag.current = { active: true, startX: e.clientX, startOffset: offsetRef.current, lastX: e.clientX, lastT: performance.now(), v: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const { minO, maxO } = bounds(center.current);
    const o = clamp(d.startOffset + (e.clientX - d.startX), minO, maxO);
    offsetRef.current = o;
    setOffset(o);
    setValue(valueAt(o, center.current));

    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.v = d.v * 0.6 + ((e.clientX - d.lastX) / dt) * 0.4;
    d.lastX = e.clientX;
    d.lastT = now;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    if (Math.abs(d.v) > 0.08) momentum();
    else snap();
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 1) return;
    stop();
    const { minO, maxO } = bounds(center.current);
    const o = clamp(offsetRef.current - delta * 0.6, minO, maxO);
    offsetRef.current = o;
    setOffset(o);
    setValue(valueAt(o, center.current));
  };

  const shown = Math.round(value);
  const mask = "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)";

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={["auto"]}
      title="Tempo"
      /* the mirror of the title: same line, right end */
      headerAction={
        <motion.button
          type="button"
          onClick={() => settle(SONG.bpm)}
          whileTap={{ scale: 0.95 }}
          transition={SPRING_PRESS}
          className="rounded-full px-3 py-1 text-[12px] transition-opacity"
          style={{ color: "var(--accent)", opacity: shown === SONG.bpm ? 0.32 : 1, pointerEvents: shown === SONG.bpm ? "none" : "auto" }}
        >
          {shown === SONG.bpm ? "Original tempo" : `Back to ${SONG.bpm}`}
        </motion.button>
      }
    >
      <div className="select-none px-1 pt-2" dir="ltr" style={{ paddingBottom: "calc(var(--safe-b) + 4px)" }}>
        {/* big readout — the ticker's digits are absolutely placed, so the ticker
            itself has no text baseline and flex was aligning "BPM" to its bottom
            edge. This zero-width strut carries the same size/leading as the digits,
            so the label rides the digits' real baseline; the ticker is start-aligned
            inside it so the number does not move. */}
        <div className="flex items-baseline justify-center gap-[10px] pt-6">
          <span className="inline-flex items-start">
            <span aria-hidden className="text-[92px] leading-[1.1]">{"\u200b"}</span>
            <NumberTicker
              value={shown}
              startOnView={false}
              duration={0.35}
              className="text-[92px] font-extrabold leading-[0.9] tracking-[-0.04em] tabular-nums text-[var(--fg)]"
            />
          </span>
          <span className="mb-[14px] text-[13px] font-semibold tracking-[0.18em] text-[var(--fg-2)]">BPM</span>
        </div>

        {/* ruler + needle */}
        <div ref={railRef} className="relative mt-5 h-[150px] w-full">
          <div className="pointer-events-none absolute left-1/2 top-0 z-30 flex -translate-x-1/2 flex-col items-center">
            <span
              style={{
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid var(--accent)",
                filter: "drop-shadow(0 0 8px var(--accent-glow))",
              }}
            />
            <span
              className="mt-[2px] h-[56px] w-[2px] rounded-full"
              style={{ background: "linear-gradient(to bottom, var(--accent) 0%, rgba(15,181,181,0.42) 100%)", boxShadow: "0 0 12px var(--accent-glow)" }}
            />
            <span className="mt-[6px] size-[5px] rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent-glow)", opacity: 0.95 }} />
          </div>

          <div
            role="slider"
            aria-label="Tempo"
            aria-valuemin={T_MIN}
            aria-valuemax={T_MAX}
            aria-valuenow={shown}
            aria-valuetext={`${shown} beats per minute`}
            tabIndex={0}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
              if (!dir) return;
              e.preventDefault();
              settle(clamp(valueRef.current + dir, T_MIN, T_MAX));
            }}
            className="absolute left-0 right-0 top-[78px] h-[72px] overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ WebkitMaskImage: mask, maskImage: mask }}
          >
            <div
              className={`absolute left-0 top-0 flex cursor-grab items-start will-change-transform ${dragging ? "cursor-grabbing" : ""}`}
              style={{ transform: `translate3d(${offset}px, 0, 0)`, touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              {Array.from({ length: T_MAX - T_MIN + 1 }, (_, i) => {
                const v = T_MIN + i;
                const major = v % 10 === 0;
                const half = v % 5 === 0;
                const near = Math.abs(v - value) < T_NEAR;
                const h = major ? 36 : half ? 20 : 10;
                const w = major ? 1.5 : 1;
                const alpha = major ? (near ? 1 : 0.34) : half ? (near ? 0.55 : 0.24) : 0.15;
                return (
                  <div key={v} className="flex shrink-0 flex-col items-center" style={{ width: T_PITCH }}>
                    <span
                      className="rounded-full bg-[var(--fg)]"
                      style={{ width: w, height: h, opacity: alpha, transition: dragging ? "none" : "opacity 120ms" }}
                    />
                    {major ? (
                      <span className="mt-[10px] text-[11px] font-medium tabular-nums tracking-[-0.01em]" style={{ color: near ? "var(--fg)" : "var(--fg-3)", transition: dragging ? "none" : "color 120ms" }}>
                        {v}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </BottomSheet>
  );
}

/* ==================================================================== *
 *  Key drawer — ported from the user's "Key control" design: a huge
 *  teal key name over an octave of piano keys, ♭ / ♯ either side.
 * ==================================================================== */

const BASE_PC = 9; // the song sits in A minor

const WHITE_KEYS = [
  { pc: 0, name: "C" },
  { pc: 2, name: "D" },
  { pc: 4, name: "E" },
  { pc: 5, name: "F" },
  { pc: 7, name: "G" },
  { pc: 9, name: "A" },
  { pc: 11, name: "B" },
];
const BLACK_KEYS = [
  { pc: 1, n: 1 },
  { pc: 3, n: 2 },
  { pc: 6, n: 4 },
  { pc: 8, n: 5 },
  { pc: 10, n: 6 },
];

const NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const NAMES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];


const KEY_UNIT = "(100% - 36px) / 7";
const HOLD_DELAY = 300;
const HOLD_EVERY = 90;

export function KeySheet({
  open,
  onOpenChange,
  semitones,
  onSemitones,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semitones: number;
  onSemitones: (value: number) => void;
}) {
  const [flat, setFlat] = useState(false);
  const [bump, setBump] = useState(0);
  const hold = useRef<{ delay?: number; every?: number }>({});
  const semitonesRef = useRef(semitones);

  const index = ((BASE_PC + semitones) % 12 + 12) % 12;
  const name = (flat ? NAMES_FLAT : NAMES_SHARP)[index];
  const delta = semitones;
  const original = delta === 0;

  useEffect(() => {
    setBump((b) => b + 1);
  }, [name]);

  useEffect(() => {
    semitonesRef.current = semitones;
  }, [semitones]);

  const clearHold = useCallback(() => {
    if (hold.current.delay) window.clearTimeout(hold.current.delay);
    if (hold.current.every) window.clearInterval(hold.current.every);
    hold.current = {};
  }, []);

  /** one semitone per press — keep holding and it runs through the keys */
  const step = useCallback(
    (dir: -1 | 1) => {
      setFlat(dir === -1);
      const next = semitonesRef.current + dir;
      const wrapped = ((next % 12) + 12) % 12;
      const norm = wrapped > 6 ? wrapped - 12 : wrapped;
      semitonesRef.current = norm;
      onSemitones(norm);
    },
    [onSemitones],
  );

  const startHold = (dir: -1 | 1) => {
    clearHold();
    step(dir);
    hold.current.delay = window.setTimeout(() => {
      hold.current.every = window.setInterval(() => step(dir), HOLD_EVERY);
    }, HOLD_DELAY);
  };

  useEffect(() => {
    if (!open) clearHold();
  }, [open, clearHold]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} snapPoints={["auto"]} title="Key">
      <div className="select-none px-1 pt-1" dir="ltr" style={{ paddingBottom: "calc(var(--safe-b) + 8px)" }}>
        {/* reset row */}
        <div className="flex h-8 items-center justify-end pb-1">
          <button
            type="button"
            onClick={() => onSemitones(0)}
            className="text-[11px] font-bold tracking-[0.18em] transition-opacity active:scale-95"
            style={{ color: "var(--accent)", opacity: original ? 0.32 : 1, pointerEvents: original ? "none" : "auto" }}
          >
            Reset
          </button>
        </div>

        {/* huge key */}
        <div className="flex flex-col items-center pt-2">
          <div key={bump} className="key-bump font-extrabold leading-[0.9] tracking-[-0.02em]" style={{ fontSize: "clamp(84px, 24vw, 120px)", color: "var(--accent)" }}>
            {name}
          </div>
          <div className="mt-3 text-center text-[12px] font-bold tracking-[0.16em] text-[var(--fg-2)]">
            {original ? "Original key" : `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "semitone" : "semitones"} ${delta > 0 ? "up" : "down"}`}
          </div>
        </div>

        {/* one octave of piano */}
        <div className="relative mt-10 h-[106px] rounded-[16px]" style={{ marginLeft: 20, marginRight: 20 }}>
          <div className="flex h-full w-full gap-[6px]">
            {WHITE_KEYS.map((k) => {
              const active = index === k.pc;
              return (
                <motion.button
                  key={k.pc}
                  type="button"
                  aria-label={`Key ${k.name}`}
                  aria-pressed={active}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onSemitones(k.pc - BASE_PC);
                  }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING_PRESS}
                  className="relative h-full flex-1 rounded-[10px]"
                  style={{
                    background: active ? "var(--accent)" : "var(--key-white)",
                    boxShadow: active ? "0 6px 16px rgba(15,181,181,0.45)" : "0 1px 3px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.12)",
                    transform: active ? "scale(1.02)" : "scale(1)",
                    touchAction: "none",
                  }}
                />
              );
            })}
          </div>

          <div className="pointer-events-none absolute left-0 top-0 h-[60%] w-full">
            {BLACK_KEYS.map((k) => {
              const active = index === k.pc;
              return (
                <motion.button
                  key={k.pc}
                  type="button"
                  aria-label={`Key ${(flat ? NAMES_FLAT : NAMES_SHARP)[k.pc]}`}
                  aria-pressed={active}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSemitones(k.pc - BASE_PC);
                  }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_PRESS}
                  className="pointer-events-auto absolute top-0 h-full rounded-b-[8px] rounded-t-[2px]"
                  style={{
                    left: `calc((${KEY_UNIT} + 6px) * ${k.n} - ${KEY_UNIT} * 0.62 / 2)`,
                    width: `calc(${KEY_UNIT} * 0.62)`,
                    background: active ? "var(--accent)" : "var(--key-black)",
                    boxShadow: active ? "0 6px 16px rgba(15,181,181,0.45)" : "0 4px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
                    transform: active ? "scale(1.06)" : "scale(1)",
                    touchAction: "none",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ♭ / ♯ */}
        <div className="mx-auto mt-12 flex w-[280px] items-center justify-between px-2 pb-2">
          {([-1, 1] as const).map((dir) => (
            <motion.button
              key={dir}
              type="button"
              aria-label={dir === -1 ? "One semitone down" : "One semitone up"}
              onPointerDown={(e) => {
                e.preventDefault();
                startHold(dir);
              }}
              onPointerUp={clearHold}
              onPointerLeave={clearHold}
              onPointerCancel={clearHold}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_PRESS}
              className="grid size-14 place-items-center rounded-full font-bold text-[var(--fg)]"
              style={{ fontSize: 34, lineHeight: 1, opacity: 0.6, touchAction: "none" }}
            >
              <span className={dir === -1 ? "-translate-y-px" : "-translate-y-0.5"}>{dir === -1 ? "♭" : "♯"}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

/* ==================================================================== *
 *  Mixer drawer — the same kind of bottom-edge sheet as tempo and key,
 *  and nothing in it but what is needed: a bare instrument glyph, then a
 *  horizontal rail. The rail is Appica UI's own Slider — their Base UI
 *  control in full, so its hover bloom on the thumb, the tilting value
 *  pill, keyboard steps and the disabled state all behave as shipped.
 * ==================================================================== */

const MIX_ICONS: Record<StemId, LucideIcon> = {
  vocals: Mic,
  drums: Drum,
  bass: Guitar,
  other: Waves,
};

/** Part of the session template, not of this track — hence a dead row. */
const MIX_IDLE = { Icon: Piano, label: "Piano", level: 45 } as const;

export function MixerSheet({
  open,
  onOpenChange,
  mix,
  onStemLevel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mix: Record<StemId, MixState>;
  onStemLevel: (id: StemId, level: number) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} snapPoints={["auto"]} ariaLabel="Mixer">
      {/* Air above the first rail matches the air below the last one (the extra
          safe-area inset rides on the bottom edge, where the home bar lives). */}
      <div className="select-none px-2 pt-1" dir="ltr" style={{ paddingBottom: "calc(var(--safe-b) + 14px)" }}>
        {STEMS.map((stem, index) => (
          <MixRow
            key={stem.id}
            index={index}
            Icon={MIX_ICONS[stem.id]}
            label={stem.label}
            value={Math.round((mix[stem.id]?.level ?? 0) * 100)}
            onValue={(next) => onStemLevel(stem.id, next / 100)}
          />
        ))}
        <MixRow index={STEMS.length} Icon={MIX_IDLE.Icon} label={MIX_IDLE.label} value={MIX_IDLE.level} disabled />
      </div>
    </BottomSheet>
  );
}

function MixRow({
  Icon,
  label,
  value,
  onValue,
  index,
  disabled,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  onValue?: (value: number) => void;
  index: number;
  disabled?: boolean;
}) {
  return (
    <motion.div
      dir="ltr"
      data-disabled={disabled ? "" : undefined}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_OUT, delay: 0.06 + index * 0.05 }}
      className="mix-row flex items-center gap-5"
    >
      {/* one 24px icon column: every glyph shares the same axis, and every
          rail therefore starts at exactly the same x */}
      <span className="grid size-6 shrink-0 place-items-center text-[var(--fg-2)]">
        <Icon className="size-[21px]" strokeWidth={1.6} aria-hidden />
      </span>
      <Slider
        className="mix-slider flex-1"
        value={value}
        onValueChange={(next) => onValue?.(typeof next === "number" ? next : next[0])}
        min={0}
        max={100}
        step={1}
        largeStep={10}
        disabled={disabled}
        thumbAriaLabel={label}
      />
      {/* the row's other end: the same 24px column, a three-dot mark — the rail
          gives up exactly this column's width */}
      <span className="grid size-6 shrink-0 place-items-center text-[var(--fg-2)]">
        <MoreHorizontal className="size-[20px]" strokeWidth={1.6} aria-hidden />
      </span>
    </motion.div>
  );
}
