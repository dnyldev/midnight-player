import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { House, ListMusic, Pause, Play, Plus, Search, SlidersHorizontal, Sparkles, X, LayoutGrid } from "lucide-react";
import { SPRING_PRESS } from "@/lib/ease";
import { NOW_PLAYING, TRACKS, type Track } from "@/data/library";
import type { DockId } from "@/components/Transport";
import { cn } from "@/lib/utils";

interface LibraryProps {
  playing: boolean;
  sheetOpen: boolean;
  onToggle: () => void;
  onOpenPanel: (panel: DockId) => void;
  /** Home tab: send the player sheet away and stay on the list. */
  onClose: () => void;
}

const TABS: { id: DockId | "home"; label: string; Icon: typeof House }[] = [
  { id: "home", label: "Library", Icon: House },
  { id: "chords", label: "Chords", Icon: LayoutGrid },
  { id: "lyrics", label: "Lyrics", Icon: ListMusic },
  { id: "mixer", label: "Mixer", Icon: SlidersHorizontal },
];

/**
 * The screen the player sheet is summoned from: a plain library list and two
 * floating pills — the now-playing bar and the tab bar. Everything here is
 * chrome-less black or white; the cover tiles are the only colour on screen.
 */
export function Library({ playing, sheetOpen, onToggle, onOpenPanel, onClose }: LibraryProps) {
  // The tab bar is navigation, and navigation here only knows one active tab:
  // home. The player's panels are independent switches and never claim a tab.
  const activeTab: DockId | "home" = "home";

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="flex items-start justify-between px-3 pb-2" style={{ paddingTop: "calc(var(--safe-t) + 18px)" }}>
        <div>
          <h1 className="text-[30px] font-bold leading-none tracking-[-0.02em]">Library</h1>
          <p className="mt-2 text-[15px] text-[var(--fg-2)]">{TRACKS.length} tracks</p>
        </div>
        <div className="-mr-2.5 flex items-center gap-2 pt-0.5 text-[var(--fg-2)]">
          <button type="button" aria-label="Add" className="grid size-11 place-items-center rounded-full transition-colors hover:text-[var(--fg)]">
            <Plus className="size-[22px]" strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Search" className="grid size-11 place-items-center rounded-full transition-colors hover:text-[var(--fg)]">
            <Search className="size-[21px]" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <ul className="no-scrollbar flex-1 overflow-y-auto pb-[190px]">
        {TRACKS.map((track, index) => (
          <TrackRow key={`${track.title}-${index}`} track={track} current={index === 3} />
        ))}
      </ul>

      {createPortal(
        <>
      {/* now-playing pill */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: sheetOpen ? 44 : 0, opacity: sheetOpen ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        style={{ bottom: "calc(var(--safe-b) + 88px)", boxShadow: "var(--shadow-float)", pointerEvents: sheetOpen ? "none" : "auto" }}
        className="glass fixed inset-x-3 z-[60] flex items-center gap-3 rounded-full py-2 pl-3 pr-2"
      >
        <span className="tile size-9 text-[15px]" style={{ background: NOW_PLAYING.color }}>
          {NOW_PLAYING.letter}
        </span>
        <button type="button" onClick={() => onOpenPanel("chords")} className="min-h-11 min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-medium leading-tight">{NOW_PLAYING.title}</span>
          <span className="block truncate text-[12px] leading-tight text-[var(--fg-2)]">{NOW_PLAYING.artist}</span>
        </button>

        <motion.button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onToggle}
          whileTap={{ scale: 0.9 }}
          transition={SPRING_PRESS}
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--fg)", color: "var(--bg)" }}
        >
          {playing ? <Pause className="size-[17px]" fill="currentColor" /> : <Play className="size-[17px] translate-x-[1px]" fill="currentColor" />}
        </motion.button>

        <motion.button
          type="button"
          aria-label="Open player"
          onClick={() => onOpenPanel("chords")}
          whileTap={{ scale: 0.9 }}
          transition={SPRING_PRESS}
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--fill)", color: "var(--fg)" }}
        >
          <Sparkles className="size-[16px]" />
        </motion.button>
      </motion.div>

      {/* tab bar */}
      <motion.nav
        animate={{ y: sheetOpen ? 74 : 0, opacity: sheetOpen ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="glass-tab fixed inset-x-3 z-[60] flex items-center justify-around rounded-full px-2 py-2"
        style={{ bottom: "calc(var(--safe-b) + 12px)", boxShadow: "var(--shadow-float)", pointerEvents: sheetOpen ? "none" : "auto" }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              onClick={() => (id === "home" ? onClose() : onOpenPanel(id))}
              className="relative flex h-11 flex-1 items-center justify-center"
            >
              {active ? (
                <motion.span layoutId="tab-pill" className="absolute inset-x-2 inset-y-0 rounded-full" style={{ background: "var(--fill)" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              ) : null}
              <Icon className={cn("relative size-[22px]", active ? "text-[var(--fg)]" : "text-[var(--fg-2)]")} strokeWidth={active ? 2.3 : 2} />
            </button>
          );
        })}
      </motion.nav>
        </>,
        document.body,
      )}

      {/* dim while the sheet is up */}
      <motion.div
        animate={{ opacity: sheetOpen ? 1 : 0 }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="pointer-events-none fixed inset-0 z-10"
        style={{ background: "var(--scrim)", backdropFilter: sheetOpen ? "blur(2px)" : undefined }}
      />
    </div>
  );
}

function TrackRow({ track, current }: { track: Track; current: boolean }) {
  return (
    <li className="row cursor-pointer" onClick={() => onOpenPanel("chords")}>
      <span className="tile size-12 text-[19px]" style={{ background: track.color }}>
        {track.title[0].toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-medium leading-tight">{track.title}</p>
        <p className="truncate text-[15px] leading-tight text-[var(--fg-2)]">{track.artist}</p>
      </div>
      {current ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--art-ink)", opacity: 0.85 }} /> : null}
      <span className="shrink-0 text-[15px] tabular-nums text-[var(--fg-2)]">{track.duration}</span>
    </li>
  );
}
