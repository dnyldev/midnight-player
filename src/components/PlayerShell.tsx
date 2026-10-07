import { AnimatePresence, motion } from "motion/react";
import { BottomSheet } from "@/components/beui/bottom-sheet";
import { Header } from "@/components/Header";
import { Ribbon, type RibbonMode } from "@/components/Ribbon";
import { Transport, type DockId, type PanelId } from "@/components/Transport";
import { PanelHost } from "@/components/panels/PanelHost";
import { Visualizer } from "@/components/Visualizer";
import type { EngineLevels } from "@/audio/engine";
import { EASE_OUT } from "@/lib/ease";
import { SONG, TOTAL_BARS, type StemId } from "@/data/song";
import { NOW_PLAYING } from "@/data/library";

interface PlayerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: "night" | "day";
  onTheme: () => void;
  mode: RibbonMode;
  onMode: (mode: RibbonMode) => void;
  /** Every open panel — the toggles are independent switches, not tabs. */
  panels: PanelId[];
  /** The mixer drawer rides above the transport, like the tempo/key drawers. */
  mixerOpen: boolean;
  onPanel: (panel: DockId) => void;
  onClosePanel: (panel: PanelId) => void;
  beat: number;
  playing: boolean;
  bpm: number;
  semitones: number;
  secPerBeat: number;
  levels: EngineLevels;
  onToggle: () => void;
  onSeek: (beat: number) => void;
  onSkip: (seconds: number) => void;
  onBpm: (bpm: number) => void;
  onSemitones: (value: number) => void;
  onOpenTempo: () => void;
  onOpenKey: () => void;
}

const barArea = (bar: number) =>
  bar < 2 ? "INTRO"
    : bar < 10 ? "VERSE 1"
    : bar < 14 ? "PRE-CHORUS"
    : bar < 22 ? "CHORUS"
    : bar < 26 ? "BRIDGE"
    : bar < 30 ? "FINAL"
    : "OUTRO";

export function PlayerShell(props: PlayerShellProps) {
  const { open, onOpenChange, playing, beat, levels } = props;
  const bar = Math.floor(beat / 4) + 1;
  const anyPanel = props.panels.length > 0;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[1]}
      defaultSnap={0}
      dismissThreshold={110}
      className="sheet-surface max-w-[560px] rounded-t-[28px] border-0 pt-[var(--safe-t)]"
      bodyClassName="pb-0"
    >
      <div className="-mx-4 flex h-full min-h-0 flex-col">
        <Header
          playing={playing}
          theme={props.theme}
          mode={props.mode}
          semitones={props.semitones}
          onClose={() => onOpenChange(false)}
          onTheme={props.onTheme}
          onMode={props.onMode}
        />

        <main
          className="grid min-h-0 flex-1 gap-2 px-4 pb-1"
          style={{
            gridTemplateRows: anyPanel ? "auto auto minmax(0, 1fr)" : "auto minmax(200px, 300px) minmax(0, 1fr)",
          }}
        >
          {/* now playing — a list row, not a card */}
          <section className="np-compact flex items-center gap-3 pb-2" style={{ borderBottom: "0.5px solid var(--hairline)" }}>
            <div className="relative shrink-0">
              <span
                key={Math.floor(beat / 4)}
                className="absolute inset-0 rounded-[22%]"
                style={{ boxShadow: "0 0 0 1px var(--hairline-2)" }}
              />
              <span className="tile np-art size-12 text-[18px]" style={{ background: NOW_PLAYING.color }}>
                {NOW_PLAYING.letter}
                {playing ? (
                  <span className="spin-slow absolute inset-[-5px] rounded-[26%] border border-dashed" style={{ borderColor: "var(--hairline-2)" }} />
                ) : null}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="np-meta flex items-center gap-1.5">
                <span className="rounded-full px-2.5 py-1 text-[12px] tabular-nums text-[var(--fg-2)]" style={{ background: "var(--fill)" }}>
                  میزان {bar}/{TOTAL_BARS}
                </span>
                <span className="rounded-full px-2.5 py-1 text-[12px] tabular-nums text-[var(--fg-2)]" style={{ background: "var(--fill)" }}>
                  {SONG.timeSignature}/4
                </span>
              </div>
            </div>

            {/* per-stem meters — ink bars, height carries the level */}
            <div className="flex items-end gap-1 self-stretch py-1">
              {(["vocals", "drums", "bass", "other"] as StemId[]).map((id) => (
                <motion.span
                  key={id}
                  className="w-[3px] rounded-full"
                  style={{ background: "var(--fg)" }}
                  animate={{ height: `${10 + (levels[id] ?? 0) * 42}px`, opacity: 0.25 + (levels[id] ?? 0) * 0.7 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                />
              ))}
            </div>
          </section>

          <Ribbon
            beat={beat}
            playing={playing}
            semitones={props.semitones}
            mode={props.mode}
            compact={anyPanel}
            onModeChange={props.onMode}
            onSeek={props.onSeek}
          />

          <PanelHost
            panels={props.panels}
            beat={beat}
            playing={playing}
            semitones={props.semitones}
            onClose={props.onClosePanel}
            onSeek={props.onSeek}
          />

          <AnimatePresence initial={false}>
            {anyPanel ? null : (
              <motion.div
                key="stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="grid min-h-0 place-items-center pb-1"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <span
                      className="tile grid size-[92px] place-items-center text-[34px]"
                      style={{ background: NOW_PLAYING.color, boxShadow: "var(--shadow-float)" }}
                    >
                      {NOW_PLAYING.letter}
                    </span>
                    {playing ? (
                      <>
                        <span className="pulse-ring absolute inset-[-10px] rounded-[26%] border" style={{ borderColor: "var(--hairline-2)" }} />
                        <span
                          className="spin-slow absolute inset-[-6px] rounded-[26%] border border-dashed"
                          style={{ borderColor: "var(--hairline-2)" }}
                        />
                      </>
                    ) : null}
                  </div>
                  <div className="text-center">
                    <div className="text-[20px] font-bold leading-tight">{NOW_PLAYING.title}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--fg-2)]">
                      {NOW_PLAYING.artist} · {barArea(Math.floor(beat / 4))}
                    </div>
                  </div>
                  <div className="flex items-end gap-1.5 pt-1">
                    {(["vocals", "drums", "bass", "other"] as StemId[]).map((id) => (
                      <motion.span
                        key={id}
                        className="w-[3px] rounded-full"
                        style={{ background: "var(--fg)" }}
                        animate={{ height: `${8 + (levels[id] ?? 0) * 34}px`, opacity: 0.25 + (levels[id] ?? 0) * 0.7 }}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* the visualiser is decoration — it steps aside when a panel needs the room */}
        <motion.div
          animate={{ height: anyPanel ? 0 : 18, opacity: anyPanel ? 0 : 0.6 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          <Visualizer height={18} bars={64} className="viz-strip" />
        </motion.div>

        <Transport
          playing={playing}
          beat={beat}
          bpm={props.bpm}
          semitones={props.semitones}
          secPerBeat={props.secPerBeat}
          panels={props.panels}
          mixerOpen={props.mixerOpen}
          onToggle={props.onToggle}
          onSeek={props.onSeek}
          onSkip={props.onSkip}
          onPanel={props.onPanel}
          onOpenTempo={props.onOpenTempo}
          onOpenKey={props.onOpenKey}
        />
      </div>
    </BottomSheet>
  );
}
