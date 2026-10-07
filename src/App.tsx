import { useCallback, useEffect, useState } from "react";
import { Library } from "@/components/Library";
import { PlayerShell } from "@/components/PlayerShell";
import { KeySheet, MixerSheet, TempoSheet } from "@/components/Drawers";
import type { DockId, PanelId } from "@/components/Transport";
import type { RibbonMode } from "@/components/Ribbon";
import { useTransport } from "@/hooks/useTransport";

type Theme = "night" | "day";

export default function App() {
  const transport = useTransport();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("night");
  const [mode, setMode] = useState<RibbonMode>("follow");
  const [panels, setPanels] = useState<PanelId[]>([]);
  const [tempoOpen, setTempoOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Independent switches: toggling one never touches the others, and turning
  // every panel off is a real state (the player just shows the artwork).
  const togglePanel = useCallback((id: PanelId) => {
    setPanels((open) => (open.includes(id) ? open.filter((p) => p !== id) : [...open, id]));
  }, []);

  const closePanel = useCallback((id: PanelId) => {
    setPanels((open) => open.filter((p) => p !== id));
  }, []);

  // The dock row mixes one drawer (the mixer) with two stacked panels.
  const toggleDock = useCallback((id: DockId) => {
    if (id === "mixer") {
      setMixerOpen((open) => !open);
      return;
    }
    togglePanel(id);
  }, [togglePanel]);

  // Opening a panel from the library also brings the player sheet up.
  const openPanel = useCallback((id: DockId) => {
    if (id === "mixer") setMixerOpen(true);
    else setPanels((open) => (open.includes(id) ? open : [...open, id]));
    setSheetOpen(true);
  }, []);

  const toggle = transport.toggle;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          void toggle();
          break;
        case "ArrowLeft":
          transport.skip(-5);
          break;
        case "ArrowRight":
          transport.skip(5);
          break;
        case "c":
        case "C":
          togglePanel("chords");
          setSheetOpen(true);
          break;
        case "l":
        case "L":
          togglePanel("lyrics");
          setSheetOpen(true);
          break;
        case "m":
        case "M":
          setMixerOpen((open) => !open);
          setSheetOpen(true);
          break;
        case "t":
        case "T":
          setTempoOpen(true);
          break;
        case "k":
        case "K":
          setKeyOpen(true);
          break;
        case "f":
        case "F":
          setMode((m) => (m === "follow" ? "map" : "follow"));
          break;
        case "Escape":
          // Each drawer also closes itself on Escape — closing here too keeps
          // the panels from disappearing when only a drawer was up.
          if (tempoOpen || keyOpen || mixerOpen) {
            setTempoOpen(false);
            setKeyOpen(false);
            setMixerOpen(false);
            return;
          }
          setPanels([]);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, transport, togglePanel, tempoOpen, keyOpen, mixerOpen]);

  const onTheme = useCallback(() => setTheme((t) => (t === "night" ? "day" : "night")), []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Library
        playing={transport.playing}
        sheetOpen={sheetOpen}
        onToggle={() => void transport.toggle()}
        onOpenPanel={openPanel}
        onClose={() => setSheetOpen(false)}
      />

      <PlayerShell
        open={sheetOpen}
        // Escape closes the innermost layer: while a sub-drawer is up, the
        // sheet's dismiss gesture puts the drawer away instead of the player.
        onOpenChange={(open) => {
          if (!open && (tempoOpen || keyOpen || mixerOpen)) {
            setTempoOpen(false);
            setKeyOpen(false);
            setMixerOpen(false);
            return;
          }
          setSheetOpen(open);
        }}
        theme={theme}
        onTheme={onTheme}
        mode={mode}
        onMode={setMode}
        panels={panels}
        mixerOpen={mixerOpen}
        onPanel={toggleDock}
        onClosePanel={closePanel}
        beat={transport.beat}
        playing={transport.playing}
        bpm={transport.bpm}
        semitones={transport.semitones}
        secPerBeat={transport.secPerBeat}
        levels={transport.levels}
        onToggle={() => void transport.toggle()}
        onSeek={transport.seekBeat}
        onSkip={transport.skip}
        onBpm={transport.setBpm}
        onSemitones={transport.setSemitones}
        onOpenTempo={() => setTempoOpen(true)}
        onOpenKey={() => setKeyOpen(true)}
      />

      <TempoSheet open={tempoOpen} onOpenChange={setTempoOpen} bpm={transport.bpm} onBpm={transport.setBpm} />
      <KeySheet open={keyOpen} onOpenChange={setKeyOpen} semitones={transport.semitones} onSemitones={transport.setSemitones} />
      <MixerSheet open={mixerOpen} onOpenChange={setMixerOpen} mix={transport.mix} onStemLevel={transport.setStemLevel} />
    </div>
  );
}
