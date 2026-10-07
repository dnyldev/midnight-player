import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Copy, Download, Keyboard, LayoutTemplate, Moon, MoreHorizontal, Sun } from "lucide-react";
import { SPRING_PRESS, SPRING_PANEL } from "@/lib/ease";
import { LYRICS, SONG, transposeChord } from "@/data/song";
import { NOW_PLAYING } from "@/data/library";
import { cn } from "@/lib/utils";

interface HeaderProps {
  playing: boolean;
  theme: "night" | "day";
  mode: "follow" | "map";
  semitones: number;
  onClose: () => void;
  onTheme: () => void;
  onMode: (mode: "follow" | "map") => void;
}

export function Header({ playing, theme, mode, semitones, onClose, onTheme, onMode }: HeaderProps) {
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
    flash("فایل LRC دانلود شد");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("لینک کپی شد");
    } catch {
      flash("کپی نشد — دستی بردار");
    }
  };

  const items = [
    { icon: LayoutTemplate, label: "حالت نوار", value: mode === "follow" ? "پیشرو" : "نقشه", onClick: () => onMode(mode === "follow" ? "map" : "follow") },
    { icon: theme === "night" ? Sun : Moon, label: "ظاهر", value: theme === "night" ? "شبانه" : "روزانه", onClick: onTheme },
    { icon: Download, label: "دانلود متن", value: ".lrc", onClick: downloadLrc },
    { icon: Copy, label: "کپی لینک", value: "url", onClick: copyLink },
  ];

  return (
    <header className="relative flex items-center justify-between gap-2 px-3 pb-1 pt-1">
      {/* identity — title first, like the app's own headers */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold leading-tight">{NOW_PLAYING.title}</p>
          <p className="truncate text-[13px] leading-tight text-[var(--fg-2)]">
            {NOW_PLAYING.artist} · {transposeChord("A", semitones)} {SONG.keyMode === "Minor" ? "min" : "maj"} · {SONG.bpm} BPM
          </p>
        </div>
        {playing ? <span className="ml-1 size-1.5 shrink-0 rounded-full bg-[var(--fg)] opacity-80" /> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <motion.button
            type="button"
            aria-label="بیشتر"
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
                  className="absolute left-0 top-[calc(100%+10px)] z-40 w-60 overflow-hidden rounded-2xl border border-[var(--hairline)] p-1.5"
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
                      کلیدهای میانبر
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

        <motion.button
          type="button"
          aria-label="بستن پلیر"
          onClick={onClose}
          whileTap={{ scale: 0.9 }}
          transition={SPRING_PRESS}
          className="grid size-11 place-items-center rounded-full text-[var(--fg-2)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--fg)]"
        >
          <ChevronDown className="size-[22px]" />
        </motion.button>
      </div>

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
