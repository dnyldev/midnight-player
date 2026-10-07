import { motion } from "motion/react";
import { BottomSheet } from "@/components/beui/bottom-sheet";
import { Header } from "@/components/Header";
import { Ribbon, type RibbonMode } from "@/components/Ribbon";
import { Transport, type DockId, type PanelId } from "@/components/Transport";
import { PanelHost } from "@/components/panels/PanelHost";
import { Visualizer } from "@/components/Visualizer";
import { EASE_OUT } from "@/lib/ease";

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
  onToggle: () => void;
  onSeek: (beat: number) => void;
  onSkip: (seconds: number) => void;
  onBpm: (bpm: number) => void;
  onSemitones: (value: number) => void;
  onOpenTempo: () => void;
  onOpenKey: () => void;
}

export function PlayerShell(props: PlayerShellProps) {
  const { open, onOpenChange, playing, beat } = props;
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
          panels={props.panels}
          mixerOpen={props.mixerOpen}
          onPanel={props.onPanel}
        />

        <main
          className="grid min-h-0 flex-1 gap-2 px-4 pb-1"
          style={{
            gridTemplateRows: anyPanel ? "auto minmax(0, 1fr)" : "minmax(200px, 300px) minmax(0, 1fr)",
          }}
        >
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
          onToggle={props.onToggle}
          onSeek={props.onSeek}
          onSkip={props.onSkip}
          onOpenTempo={props.onOpenTempo}
          onOpenKey={props.onOpenKey}
        />
      </div>
    </BottomSheet>
  );
}
