/* ------------------------------------------------------------------ *
 *  The library behind the player — one row per track, as in the
 *  reference: lettered cover tile, lowercase title, artist, duration.
 * ------------------------------------------------------------------ */

export interface Track {
  title: string;
  artist: string;
  duration: string;
  /** cover colour — dark, muted jewel tones; the only colour in the UI */
  color: string;
}

/** Cover palette sampled from the reference art tiles. */
const C = {
  ink: "#141416",
  navy: "#1b2b4b",
  purple: "#3a0f3f",
  teal: "#0e2c3f",
  olive: "#2e3a0e",
  maroon: "#4a1220",
  rust: "#3a1510",
  forest: "#0f2e22",
  graphite: "#3a3630",
  cobalt: "#14213d",
  wine: "#3d0f2a",
  slate: "#1d2a2e",
} as const;

export const TRACKS: Track[] = [
  { title: "khooneye arezoo", artist: "moein", duration: "3:07", color: C.graphite },
  { title: "parvaze ghooha", artist: "alireza ghorbani", duration: "3:44", color: C.navy },
  { title: "betars", artist: "mohsen yeganeh", duration: "4:21", color: C.ink },
  { title: "midnight drift", artist: "arctic tones", duration: "4:58", color: C.purple },
  { title: "neon pulse", artist: "nova lane", duration: "2:42", color: C.teal },
  { title: "amber haze", artist: "lumen field", duration: "3:19", color: C.olive },
  { title: "cold river", artist: "atlas club", duration: "3:56", color: C.ink },
  { title: "velvet morning", artist: "velvet cove", duration: "4:33", color: C.maroon },
  { title: "static love", artist: "arctic tones", duration: "3:10", color: C.rust },
  { title: "ghaf", artist: "alireza talischi", duration: "3:52", color: C.forest },
  { title: "kinetic", artist: "lumen field", duration: "4:19", color: C.olive },
  { title: "moire", artist: "atlas club", duration: "4:56", color: C.wine },
  { title: "solar", artist: "velvet cove", duration: "2:40", color: C.rust },
  { title: "lucid", artist: "solaris", duration: "3:17", color: C.forest },
  { title: "cerulean", artist: "kairo", duration: "3:54", color: C.forest },
  { title: "monolith", artist: "halo drift", duration: "4:31", color: C.ink },
  { title: "oxide", artist: "cerulean", duration: "5:08", color: C.graphite },
  { title: "quartz", artist: "opal", duration: "2:52", color: C.cobalt },
  { title: "thicket", artist: "boreal", duration: "3:29", color: C.slate },
  { title: "boreal", artist: "halo drift", duration: "4:06", color: C.wine },
];

/** The track the player is on — its tile also tints the player's accents. */
export const NOW_PLAYING = {
  title: "midnight society",
  artist: "neon veil",
  letter: "M",
  color: C.purple,
};
