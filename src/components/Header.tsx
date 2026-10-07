import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Copy, Download, Keyboard, LayoutGrid, LayoutTemplate, ListMusic, Moon, MoreHorizontal, SlidersHorizontal, Sun } from "lucide-react";
import { SPRING_PRESS, SPRING_PANEL } from "@/lib/ease";
import { LYRICS, SONG } from "@/data/song";
import { cn } from "@/lib/utils";
import type { DockId, PanelId } from "@/components/Transport";

const PANELS: { id: DockId; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "chords", label: "Chord diagrams", Icon: LayoutGrid },
  { id: "lyrics", label: "Lyrics", Icon: ListMusic },
  { id: "mixer", label: "Mixer", Icon: SlidersHorizontal },
];

interface HeaderProps {
  playing: boolean;
  theme: "night" | "day";
  mode: "follow" | "map";
  semitones: number;
  onClose: () => void;
  onTheme: () => void;
  onMode: (mode: "follow" | "map") => void;
  /** Every open panel — the toggles are independent, so this is a set. */
  panels: PanelId[];
  /** The mixer lives in its own bottom drawer, matching tempo and key. */
  mixerOpen: boolean;
  onPanel: (panel: DockId) => void;
}

export function Header({ playing, theme, mode, semitones, onClose, onTheme, onMode, panels, mixerOpen, onPanel }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const downloadLrc = () => {
    const secPerBeat = 60 / SONG.bpm;
    const stamp = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
    };
    const body = [
      `[ti:${SONG.title}]`,
      `[ar:${SONG.artist}]`,
      `[al:${SONG.album}]`,
      "",
      ...LYRICS.map((line) => `[${stamp(line.beat * secPerBeat)}]${line.text}`),
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${SONG.title} - ${SONG.artist}.lrc`;
    link.click();
    URL.revokeObjectURL(url);
    flash("LRC file downloaded");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("Link copied");
    } catch {
      flash("Couldn\'t copy — grab it manually");
    }
  };

  const items = [
    { icon: LayoutTemplate, label: "Ribbon mode", value: mode === "follow" ? "Follow" : "Map", onClick: () => onMode(mode === "follow" ? "map" : "follow") },
    { icon: theme === "night" ? Sun : Moon, label: "Appearance", value: theme === "night" ? "Night" : "Day", onClick: onTheme },
    { icon: Download, label: "Download lyrics", value: ".lrc", onClick: downloadLrc },
    { icon: Copy, label: "Copy link", value: "url", onClick: copyLink },
  ];

  return (
    <header className="relative flex items-center justify-between gap-2 px-3 pb-1 pt-1">
      {/* the close chevron is pulled out of flow to the frame's LEFT edge — the exact
          mirror of the ⋯ wrapper on the right edge below */}
      <div className="absolute left-3 top-1/2 z-40 -translate-y-1/2">
        <motion.button
          type="button"
          aria-label="Close player"
          onClick={onClose}
          whileTap={{ scale: 0.9 }}
          transition={SPRING_PRESS}
          className="grid size-11 place-items-center rounded-full text-[var(--fg-2)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--fg)]"
        >
          <ChevronDown className="size-[22px]" />
        </motion.button>
      </div>

      {/* the toggles start past the chevron's 44px so nothing sits under it */}
      <div className="flex shrink-0 items-center gap-1 pl-11">
        {playing ? <span className="ml-1 size-1.5 shrink-0 rounded-full bg-[var(--fg)] opacity-80" /> : null}

        {/* panel toggles — independent switches, not tabs. In flow with the playing
            dot, past the chevron; the ⋯ is out of flow on the right edge. */}
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

        <div className="absolute right-3 top-1/2 z-40 -translate-y-1/2">
          <motion.button
            type="button"
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            whileTap={{ scale: 0.9 }}
            transition={SPRING_PRESS}
            className={cn("grid size-11 place-items-center rounded-full transition-colors", menuOpen ? "bg-[var(--fill)]" : "text-[var(--fg-2)] hover:bg-[var(--fill)] hover:text-[var(--fg)]")}
          >
            <MoreHorizontal className="size-[20px]" />
          </motion.button>

          <AnimatePresence>
            {menuOpen ? (
              <>
                <motion.div className="fixed inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={SPRING_PANEL}
                  className="absolute right-0 top-[calc(100%+10px)] z-40 w-60 overflow-hidden rounded-2xl border border-[var(--hairline)] p-1.5"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-float)" }}
                >
                  {items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        item.onClick();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-right transition-colors hover:bg-[var(--fill)]"
                    >
                      <span className="flex items-center gap-2.5">
                        <item.icon className="size-[17px] text-[var(--fg-2)]" />
                        <span className="text-[14px]">{item.label}</span>
                      </span>
                      <span className="text-[12px] text-[var(--fg-3)]">{item.value}</span>
                    </button>
                  ))}

                  <div className="mx-2 my-1.5 h-px" style={{ background: "var(--hairline)" }} />

                  <div className="px-2.5 py-1.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[12px] text-[var(--fg-2)]">
                      <Keyboard className="size-3.5" />
                      Keyboard shortcuts
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {["Space", "←", "→", "C", "L", "M", "T", "K"].map((k) => (
                        <kbd key={k} className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--fg-2)]" style={{ background: "var(--fill)" }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* an empty trailing spacer keeps the button group pinned to the frame's
          left edge; the ⋯ menu is pulled out of flow to the right edge above */}
      <div className="min-w-0" aria-hidden="true" />

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px]"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

    </header>
  );
}
