/* ------------------------------------------------------------------ *
 *  The song: "Midnight Society" — Neon Veil
 *  A 32-bar loop in A minor · 4/4 · 92 BPM
 * ------------------------------------------------------------------ */

export const SONG = {
  title: "Midnight Society",
  artist: "Neon Veil",
  album: "Afterglow Sessions",
  bpm: 92,
  keyRoot: "A",
  keyMode: "Minor",
  timeSignature: 4 as const,
  totalBars: 32,
};

/* ------------------------------------------------------------------ *
 *  Chords — note voicings (MIDI), guitar shapes and pretty names
 * ------------------------------------------------------------------ */

export interface ChordDef {
  name: string;
  /** Pad voicing, MIDI numbers (C4 = 60) */
  notes: number[];
  /** Bass root, MIDI */
  root: number;
  /** Fret per string, low E → high E. -1 = muted */
  shape: number[];
  /** finger per string (0 = open, -1 = mute) */
  fingers: number[];
  /** optional barre: [fret, fromStringIdx, toStringIdx] */
  barre?: [number, number, number];
}

const chords: Record<string, ChordDef> = {
  Am7: { name: "Am7", notes: [57, 60, 64, 67], root: 45, shape: [-1, 0, 2, 0, 1, 0], fingers: [-1, 0, 2, 0, 1, 0] },
  Fmaj7: { name: "Fmaj7", notes: [53, 57, 60, 64], root: 41, shape: [-1, -1, 3, 2, 1, 0], fingers: [-1, -1, 3, 2, 1, 0] },
  Cmaj7: { name: "Cmaj7", notes: [48, 52, 55, 59], root: 36, shape: [-1, 3, 2, 0, 0, 0], fingers: [-1, 3, 2, 0, 0, 0] },
  G6: { name: "G6", notes: [55, 59, 62, 64], root: 43, shape: [3, 2, 0, 0, 0, 0], fingers: [3, 2, 0, 0, 0, 0] },
  Dm7: { name: "Dm7", notes: [50, 53, 57, 60], root: 38, shape: [-1, -1, 0, 2, 1, 1], fingers: [-1, -1, 0, 2, 1, 1] },
  G7: { name: "G7", notes: [55, 59, 62, 65], root: 43, shape: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Aadd9: { name: "Aadd9", notes: [57, 61, 64, 71], root: 45, shape: [-1, 0, 2, 2, 0, 0], fingers: [-1, 0, 1, 3, 0, 0] },
  Bbmaj7: { name: "B♭maj7", notes: [58, 62, 65, 69], root: 46, shape: [-1, 1, 3, 2, 3, 1], fingers: [-1, 1, 3, 2, 4, 1], barre: [1, 1, 5] },
  Gm7: { name: "Gm7", notes: [55, 58, 62, 65], root: 43, shape: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], barre: [3, 2, 5] },
  Em7: { name: "Em7", notes: [52, 55, 59, 62], root: 40, shape: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  E7: { name: "E7", notes: [52, 56, 59, 62], root: 40, shape: [0, 2, 0, 1, 0, 0], fingers: [0, 3, 0, 1, 0, 0] },
  G7sus4: { name: "G7sus4", notes: [55, 60, 62, 65], root: 43, shape: [3, 3, 0, 0, 1, 1], fingers: [1, 2, 0, 0, 3, 4] },
};

export const CHORDS = chords;

/* ------------------------------------------------------------------ *
 *  Bars — one chord per bar unless a second one lands mid-bar
 * ------------------------------------------------------------------ */

export interface Bar {
  index: number;
  section: string;
  /** [beatIndex(0-3), chordName] — first entry is the downbeat */
  changes: [number, string][];
}

type BarSpec = [chord: string, midChord?: string];
const spec: BarSpec[] = [
  ["Am7"], ["Am7"],
  ["Am7"], ["Fmaj7"], ["Cmaj7", "G7"], ["G6"],
  ["Am7"], ["Fmaj7"], ["Dm7"], ["G7", "E7"],
  ["Dm7"], ["Aadd9"], ["Bbmaj7"], ["G7"],
  ["Cmaj7"], ["Gm7"], ["Aadd9"], ["Fmaj7"],
  ["Cmaj7"], ["Gm7"], ["Aadd9"], ["G7", "G7sus4"],
  ["Dm7"], ["Em7"], ["Fmaj7"], ["G7", "E7"],
  ["Am7"], ["Fmaj7"], ["Cmaj7"], ["G6"],
  ["Am7"], ["Am7"],
];

const sectionAt = (bar: number) =>
  bar < 2 ? "INTRO"
    : bar < 10 ? "VERSE 1"
    : bar < 14 ? "PRE-CHORUS"
    : bar < 22 ? "CHORUS"
    : bar < 26 ? "BRIDGE"
    : bar < 30 ? "FINAL"
    : "OUTRO";

export const BARS: Bar[] = spec.map(([prime, mid], index) => ({
  index,
  section: sectionAt(index),
  changes: mid ? [[0, prime], [2, mid]] : [[0, prime]],
}));

export const TOTAL_BARS = BARS.length;
export const TOTAL_BEATS = TOTAL_BARS * SONG.timeSignature;

/** Chord that owns a given global beat. */
export function chordAtBeat(beat: number): string {
  const barIndex = Math.min(TOTAL_BARS - 1, Math.max(0, Math.floor(beat / 4)));
  const inBar = Math.floor(beat % 4);
  const bar = BARS[barIndex];
  let name = bar.changes[0][1];
  for (const [at, chord] of bar.changes) if (inBar >= at) name = chord;
  return name;
}

/** Where each chord change happens, as a flat timeline. */
export const CHANGES = BARS.flatMap((bar) =>
  bar.changes.map(([beatInBar, chord]) => ({
    beat: bar.index * 4 + beatInBar,
    chord,
    bar: bar.index,
    section: bar.section,
  })),
);

/* ------------------------------------------------------------------ *
 *  Lyrics — English line + Persian translation, anchored to a beat
 * ------------------------------------------------------------------ */

interface LyricLine {
  beat: number;
  text: string;
  fa: string;
}

export const LYRICS: LyricLine[] = [
  { beat: 8, text: "Midnight city, lights are low", fa: "شهر نیمه‌شب، چراغ‌ها کم‌نور" },
  { beat: 16, text: "Neon veil in afterglow", fa: "هاله‌ای نئونی در پس‌درخشش" },
  { beat: 24, text: "Whispers echo down the street", fa: "نجواها در خیابان می‌پیچند" },
  { beat: 32, text: "Shadows dancing to the beat", fa: "سایه‌ها با ضرب‌آهنگ می‌رقصند" },
  { beat: 40, text: "Hold me close in satin dreams", fa: "در رؤیاهای اطلسی نگهَم دار" },
  { beat: 48, text: "Silver rivers, quiet streams", fa: "رودهای نقره‌ای، جویبارهای آرام" },
  { beat: 56, text: "Your perfume, a gentle ghost", fa: "عطر تو، شبحی مهربان" },
  { beat: 64, text: "In this night we need the most", fa: "در این شب، بیشترین نیازِ ما" },
  { beat: 72, text: "Society of midnight hearts", fa: "انجمنِ دل‌های نیمه‌شب" },
  { beat: 80, text: "Where every end is where it starts", fa: "آنجا که هر پایان، آغاز است" },
  { beat: 88, text: "Every heartbeat keeps the time", fa: "هر تپش قلب، زمان را نگه می‌دارد" },
  { beat: 96, text: "You and I, a stolen rhyme", fa: "من و تو، قافیه‌ای دزدیده" },
];

/** Index of the line that owns a beat (intro/outro return -1). */
export function lyricIndexAtBeat(beat: number): number {
  let idx = -1;
  for (let i = 0; i < LYRICS.length; i++) if (beat >= LYRICS[i].beat) idx = i;
  return idx;
}

/* ------------------------------------------------------------------ *
 *  Stems (mixer) — defaults echo the original session
 * ------------------------------------------------------------------ */

export type StemId = "vocals" | "drums" | "bass" | "other";

export const STEMS: { id: StemId; label: string; fa: string; icon: string; defaultLevel: number }[] = [
  { id: "vocals", label: "Vocals", fa: "وکال", icon: "mic", defaultLevel: 92 },
  { id: "drums", label: "Drums", fa: "درامز", icon: "drum", defaultLevel: 78 },
  { id: "bass", label: "Bass", fa: "باس", icon: "guitar", defaultLevel: 84 },
  { id: "other", label: "Other", fa: "پد و اتمسفر", icon: "waves", defaultLevel: 70 },
];

/** Strumming pattern for one bar — 8 eighth-note slots: D / U / · */
export const STRUM = ["D", "", "D", "U", "", "U", "D", "U"] as const;

export const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const SHARP_OR_FLAT: Record<string, string[]> = {
  C: ["C", "B♯"],
  "C♯": ["C♯", "D♭"],
  D: ["D"],
  "D♯": ["D♯", "E♭"],
  E: ["E"],
  F: ["F"],
  "F♯": ["F♯", "G♭"],
  G: ["G"],
  "G♯": ["G♯", "A♭"],
  A: ["A"],
  "A♯": ["A♯", "B♭"],
  B: ["B"],
};

/** Transpose a chord symbol ("B♭maj7") by N semitones. */
export function transposeChord(name: string, semitones: number): string {
  if (!semitones) return name;
  const match = name.match(/^([A-G][♯♭]?)(.*)$/);
  if (!match) return name;
  const [, root, rest] = match;
  const flatPreferred = root.includes("♭");
  const idx = NOTE_NAMES.indexOf(root.replace("♭", "♯"));
  if (idx < 0) return name;
  const nextIdx = (idx + semitones + 120) % 12;
  const canonical = NOTE_NAMES[nextIdx];
  const options = SHARP_OR_FLAT[canonical] ?? [canonical];
  const spelled = flatPreferred && options[1] ? options[1] : options[0];
  return `${spelled}${rest}`;
}

export function transposeChordDef(def: ChordDef, semitones: number): ChordDef {
  if (!semitones) return def;
  return {
    ...def,
    name: transposeChord(def.name, semitones),
    notes: def.notes.map((n) => n + semitones),
    root: def.root + semitones,
  };
}
