import { motion } from "motion/react";
import { Play } from "lucide-react";
import { SPRING_PRESS } from "@/lib/ease";

interface LauncherProps {
  /** Summons the player drawer — the same one a library row used to open. */
  onOpen: () => void;
}

/**
 * The entry screen now that the library list is out of the way: one button.
 * Tapping it brings up the player sheet, exactly like tapping a track row
 * used to. No list, no tabs, no now-playing pill — the player is the app.
 */
export function Launcher({ onOpen }: LauncherProps) {
  return (
    <div className="fixed inset-0 grid place-items-center" style={{ background: "var(--bg)" }}>
      <div className="relative grid place-items-center">
        {/* the app's own pulse ring, borrowed from the player's playing dot */}
        <span
          aria-hidden
          className="pulse-ring pointer-events-none absolute size-24 rounded-full"
          style={{ background: "var(--tint)", border: "0.5px solid var(--hairline-2)" }}
        />
        <motion.button
          type="button"
          aria-label="Open player"
          onClick={onOpen}
          whileTap={{ scale: 0.92 }}
          transition={SPRING_PRESS}
          className="glass relative grid size-24 place-items-center rounded-full"
          style={{ boxShadow: "var(--shadow-float)", color: "var(--fg)" }}
        >
          <Play className="size-8 translate-x-[2px]" fill="currentColor" />
        </motion.button>
      </div>
    </div>
  );
}
