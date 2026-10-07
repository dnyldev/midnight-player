import {
  BARS,
  CHORDS,
  SONG,
  STEMS,
  STRUM,
  TOTAL_BARS,
  TOTAL_BEATS,
  chordAtBeat,
  transposeChordDef,
  type StemId,
} from "@/data/song";

const STEPS_PER_BEAT = 4; // 16th-note grid
const STEPS_PER_BAR = STEPS_PER_BEAT * SONG.timeSignature;
const LOOKAHEAD = 0.16; // seconds of audio scheduled ahead
const TICK_MS = 25;

type Live = { source: AudioScheduledSourceNode; gain: GainNode; end: number };

/** Kick / snare / hat / bass / strum patterns, as 16th-note steps inside a bar. */
const KICK = [0, 8, 14];
const SNARE = [4, 12];
const HATS = [0, 2, 4, 6, 8, 10, 12, 14];
const FILL_BARS = [1, 5, 9, 13, 17, 21, 25, 29]; // last bar of a phrase gets a fill

/** Lead phrases: [stepInBar, chordToneIndex, lengthInSteps] */
const PHRASES: [number, number, number][][] = [
  [[0, 2, 7], [8, 1, 4], [12, 3, 4]],
  [[0, 3, 6], [6, 2, 5], [12, 1, 4]],
  [[0, 0, 9], [10, 2, 6]],
  [[0, 1, 7], [8, 3, 4], [13, 2, 3]],
];

export interface EngineLevels {
  vocals: number;
  drums: number;
  bass: number;
  other: number;
}

export class MusicEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private analyser!: AnalyserNode;
  private spectrum!: Uint8Array;
  private stems: Record<StemId, { gain: GainNode; analyser: AnalyserNode; level: number; muted: boolean }> =
    {} as never;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private delay!: DelayNode;
  private delaySend!: GainNode;
  private noiseBuffer!: AudioBuffer;

  private live: Live[] = [];
  private timer: number | null = null;
  private anchorTime = 0; // ctx time at `anchorBeat`
  private anchorBeat = 0;
  private nextStep = 0;
  private nextStepTime = 0;

  bpm = SONG.bpm;
  semitones = 0;
  playing = false;

  /* ---------------------------------------------------------------- */
  /*  Setup                                                           */
  /* ---------------------------------------------------------------- */

  async ensure(): Promise<AudioContext> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.008;
    comp.release.value = 0.22;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Per-stem buses
    for (const stem of STEMS) {
      const gain = ctx.createGain();
      gain.gain.value = Math.pow(stem.defaultLevel / 100, 1.4);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      gain.connect(this.master);
      this.stems[stem.id] = { gain, analyser, level: stem.defaultLevel / 100, muted: false };
    }

    // Space — convolution reverb from a generated impulse
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.36;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.stems.other.gain);

    // Slap-back delay for the lead
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.3;
    this.delaySend.connect(this.delay);
    this.delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(this.delay);
    damp.connect(this.stems.other.gain);

    this.noiseBuffer = this.makeNoise(2);

    return ctx;
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  /* ---------------------------------------------------------------- */
  /*  Transport                                                       */
  /* ---------------------------------------------------------------- */

  get secPerBeat() {
    return 60 / this.bpm;
  }

  get duration() {
    return TOTAL_BEATS * this.secPerBeat;
  }

  position(): number {
    if (!this.ctx || !this.playing) return this.anchorBeat;
    const raw = this.anchorBeat + (this.ctx.currentTime - this.anchorTime) / this.secPerBeat;
    return Math.min(TOTAL_BEATS, raw);
  }

  positionSeconds() {
    return this.position() * this.secPerBeat;
  }

  async play(fromBeat?: number) {
    const ctx = await this.ensure();
    if (fromBeat !== undefined) this.anchorBeat = fromBeat;
    this.anchorBeat = Math.max(0, Math.min(TOTAL_BEATS - 0.25, this.anchorBeat));
    this.anchorTime = ctx.currentTime + 0.08;
    this.nextStep = Math.ceil(this.anchorBeat * STEPS_PER_BEAT);
    this.nextStepTime = this.anchorTime + (this.nextStep / STEPS_PER_BEAT - this.anchorBeat) * this.secPerBeat;
    this.playing = true;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.18);
    this.startAtmosphere();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  pause() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const beat = this.position();
    this.playing = false;
    this.anchorBeat = beat;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    const killAt = ctx.currentTime + 0.12;
    for (const voice of this.live) {
      try {
        voice.gain.gain.cancelScheduledValues(killAt);
        voice.gain.gain.setTargetAtTime(0.0001, killAt, 0.03);
        voice.source.stop(killAt + 0.18);
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
    this.stopAtmosphere();
  }

  seek(beat: number) {
    const target = Math.max(0, Math.min(TOTAL_BEATS - 0.25, beat));
    const wasPlaying = this.playing;
    if (wasPlaying && this.ctx) {
      const ctx = this.ctx;
      const killAt = ctx.currentTime + 0.02;
      for (const voice of this.live) {
        try {
          voice.gain.gain.cancelScheduledValues(killAt);
          voice.gain.gain.setTargetAtTime(0.0001, killAt, 0.02);
          voice.source.stop(killAt + 0.12);
        } catch {
          /* noop */
        }
      }
      this.live = [];
      this.anchorBeat = target;
      this.anchorTime = ctx.currentTime + 0.04;
      this.nextStep = Math.ceil(target * STEPS_PER_BEAT);
      this.nextStepTime = this.anchorTime + (this.nextStep / STEPS_PER_BEAT - target) * this.secPerBeat;
    } else {
      this.anchorBeat = target;
    }
  }

  setBpm(bpm: number) {
    const clamped = Math.max(40, Math.min(200, Math.round(bpm)));
    if (clamped === this.bpm) return;
    const at = this.position();
    this.bpm = clamped;
    if (this.ctx) {
      this.delay.delayTime.setTargetAtTime((60 / this.bpm) * 0.75, this.ctx.currentTime, 0.05);
      if (this.playing) this.seek(at);
    }
  }

  setSemitones(value: number) {
    this.semitones = ((value % 12) + 12) % 12;
    if (this.semitones > 6) this.semitones -= 12;
  }

  setStem(id: StemId, level: number, muted?: boolean) {
    const stem = this.stems[id];
    if (!stem) return;
    if (level !== undefined) stem.level = Math.max(0, Math.min(1, level));
    if (muted !== undefined) stem.muted = muted;
    const value = stem.muted ? 0 : Math.pow(stem.level, 1.4);
    if (this.ctx) stem.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.03);
  }

  stemState() {
    return this.stems;
  }

  levels(): EngineLevels {
    const read = (id: StemId) => {
      const stem = this.stems[id];
      if (!stem) return 0;
      const buf = new Uint8Array(stem.analyser.fftSize);
      stem.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 3.4);
    };
    return { vocals: read("vocals"), drums: read("drums"), bass: read("bass"), other: read("other") };
  }

  spectrumData(): Uint8Array | null {
    if (!this.ctx) return null;
    this.analyser.getByteFrequencyData(this.spectrum);
    return this.spectrum;
  }

  /* ---------------------------------------------------------------- */
  /*  Scheduler                                                       */
  /* ---------------------------------------------------------------- */

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      const step = this.nextStep;
      if (step >= TOTAL_BEATS * STEPS_PER_BEAT) {
        this.finish();
        return;
      }
      this.scheduleStep(step, this.nextStepTime);
      this.nextStep += 1;
      this.nextStepTime += this.secPerBeat / STEPS_PER_BEAT;
    }
    this.prune();
  }

  private finish() {
    const ctx = this.ctx!;
    this.playing = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35);
    this.anchorBeat = 0;
    this.stopAtmosphere();
    this.onEnd?.();
  }

  onEnd?: () => void;

  private prune() {
    const now = this.ctx!.currentTime;
    this.live = this.live.filter((v) => v.end > now - 0.5);
  }

  private scheduleStep(step: number, time: number) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const beatInBar = Math.floor(inBar / STEPS_PER_BEAT);
    const isLastBar = bar >= TOTAL_BARS - 1;
    const globalBeat = step / STEPS_PER_BEAT;
    const chordName = chordAtBeat(globalBeat);
    const def = transposeChordDef(CHORDS[chordName] ?? CHORDS.Am7, this.semitones);
    const stepDur = this.secPerBeat / STEPS_PER_BEAT;

    /* --- arrangement: layers enter as the song grows --------------- */
    const drumsOn = bar >= 2;
    const bassOn = bar >= 2;
    const leadOn = bar >= 6;
    const strumOn = bar >= 2 && !isLastBar;
    const fill = FILL_BARS.includes(bar);

    // Pad — one long voicing per chord change
    const changeBeat = BARS[bar].changes.find(([b]) => b === beatInBar);
    if (changeBeat) {
      const beatsLeft = (TOTAL_BARS - 1 - bar) * 4 + (4 - beatInBar);
      const hold = Math.min(beatsLeft, isLastBar ? 8 : 5) * this.secPerBeat;
      this.pad(def.notes, time, hold);
    }

    // Drums
    if (drumsOn) {
      if (KICK.includes(inBar)) this.kick(time, inBar === 0 ? 1 : 0.78);
      if (SNARE.includes(inBar)) this.snare(time, 0.62);
      if (HATS.includes(inBar)) this.hat(time, inBar % 4 === 0 ? 0.4 : 0.22, inBar % 8 === 6);
      if (fill && beatInBar === 3) this.snare(time, 0.3 + inBar * 0.03);
      if (isLastBar && inBar === 0) this.crash(time);
    }

    // Bass — root on the downbeat, pickup before the next bar
    if (bassOn) {
      if (inBar === 0) this.bass(def.root, time, stepDur * 7);
      if (inBar === 10) this.bass(def.root, time, stepDur * 3.6);
      if (inBar === 14) this.bass(def.root + 7, time, stepDur * 2);
    }

    // Strummed guitar following the on-screen pattern
    if (strumOn && inBar % 2 === 0) {
      const slot = inBar / 2;
      const mark = STRUM[slot];
      if (mark) this.strum(def.notes, time, mark === "D");
    }

    // Lead melody
    if (leadOn) {
      const phrase = PHRASES[bar % PHRASES.length];
      const note = phrase.find(([at]) => at === inBar);
      if (note) {
        const [, toneIdx, len] = note;
        const midi = def.notes[toneIdx % def.notes.length] + 12;
        this.lead(midi, time, len * stepDur);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Voices                                                          */
  /* ---------------------------------------------------------------- */

  private track(source: AudioScheduledSourceNode, gain: GainNode, end: number) {
    this.live.push({ source, gain, end });
  }

  private pad(notes: number[], time: number, hold: number) {
    const ctx = this.ctx!;
    const bus = this.stems.other.gain;
    for (const midi of notes) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = this.midiToHz(midi);
      const detune = ctx.createOscillator();
      detune.type = "sawtooth";
      detune.frequency.value = this.midiToHz(midi) * 1.004;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(700, time);
      filter.frequency.linearRampToValueAtTime(2100, time + hold * 0.55);
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.055, time + 0.9);
      gain.gain.setValueAtTime(0.055, time + hold * 0.75);
      gain.gain.linearRampToValueAtTime(0.0001, time + hold + 0.85);
      osc.connect(filter);
      detune.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      gain.connect(this.reverbSend);
      osc.start(time);
      detune.start(time);
      osc.stop(time + hold + 0.95);
      detune.stop(time + hold + 0.95);
      this.track(osc, gain, time + hold + 0.95);
    }
  }

  private bass(midi: number, time: number, hold: number) {
    const ctx = this.ctx!;
    const bus = this.stems.bass.gain;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = this.midiToHz(midi);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = this.midiToHz(midi) / 2;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.5, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.14, time + Math.max(0.12, hold * 0.7));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + hold + 0.08);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(time);
    sub.start(time);
    osc.stop(time + hold + 0.12);
    sub.stop(time + hold + 0.12);
    this.track(osc, gain, time + hold + 0.12);
  }

  private pluckVoice(midi: number, time: number, level: number, decay: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = this.midiToHz(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3400, time);
    filter.frequency.exponentialRampToValueAtTime(700, time + decay);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(filter);
    filter.connect(gain);
    return { osc, gain };
  }

  private strum(notes: number[], time: number, down: boolean) {
    const list = [...notes].slice(1).reverse();
    const level = down ? 0.05 : 0.032;
    const decay = down ? 0.9 : 0.62;
    list.forEach((midi, i) => {
      const offset = time + (down ? i * 0.012 : (list.length - i) * 0.012);
      const { osc, gain } = this.pluckVoice(midi + 12, offset, level, decay);
      gain.connect(this.stems.other.gain);
      gain.connect(this.reverbSend);
      osc.start(offset);
      osc.stop(offset + decay + 0.05);
      this.track(osc, gain, offset + decay + 0.05);
    });
  }

  private lead(midi: number, time: number, hold: number) {
    const ctx = this.ctx!;
    const bus = this.stems.vocals.gain;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = this.midiToHz(midi);
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = this.midiToHz(midi) * 2.005;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5; // cents-ish vibrato in Hz
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(shimmer.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100, time);
    filter.frequency.linearRampToValueAtTime(2600, time + 0.3);
    const gain = ctx.createGain();
    const attack = Math.min(0.16, hold * 0.25);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.34, time + attack);
    gain.gain.setValueAtTime(0.34, time + Math.max(attack, hold * 0.7));
    gain.gain.linearRampToValueAtTime(0.0001, time + hold + 0.22);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.18;
    osc.connect(filter);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    gain.connect(this.reverbSend);
    gain.connect(this.delaySend);
    osc.start(time);
    shimmer.start(time);
    lfo.start(time);
    const stop = time + hold + 0.28;
    osc.stop(stop);
    shimmer.stop(stop);
    lfo.stop(stop);
    this.track(osc, gain, stop);
  }

  private kick(time: number, level: number) {
    const ctx = this.ctx!;
    const bus = this.stems.drums.gain;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(132, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.95 * level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + 0.45);
    this.track(osc, gain, time + 0.45);
  }

  private snare(time: number, level: number) {
    const ctx = this.ctx!;
    const bus = this.stems.drums.gain;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 1;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1900;
    band.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.3 * level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.value = 190;
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(0.13 * level, time + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    noise.connect(band);
    band.connect(gain);
    body.connect(bodyGain);
    gain.connect(bus);
    bodyGain.connect(bus);
    noise.start(time);
    body.start(time);
    noise.stop(time + 0.22);
    body.stop(time + 0.2);
    this.track(noise, gain, time + 0.22);
    gain.connect(this.reverbSend);
  }

  private hat(time: number, level: number, open: boolean) {
    const ctx = this.ctx!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 1.7;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 7600;
    const gain = ctx.createGain();
    const decay = open ? 0.16 : 0.045;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    noise.connect(high);
    high.connect(gain);
    gain.connect(this.stems.drums.gain);
    noise.start(time);
    noise.stop(time + decay + 0.03);
    this.track(noise, gain, time + decay + 0.03);
  }

  private crash(time: number) {
    const ctx = this.ctx!;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 4200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.22, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
    noise.connect(high);
    high.connect(gain);
    gain.connect(this.stems.drums.gain);
    gain.connect(this.reverbSend);
    noise.start(time);
    noise.stop(time + 1.9);
    this.track(noise, gain, time + 1.9);
  }

  /* --- atmosphere: a continuous, slowly-breathing noise bed -------- */
  private atmosphere: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  private startAtmosphere() {
    const ctx = this.ctx!;
    if (this.atmosphere) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 620;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(band.frequency);
    source.connect(band);
    band.connect(gain);
    gain.connect(this.stems.other.gain);
    source.start();
    lfo.start();
    this.atmosphere = { source, gain };
  }

  private stopAtmosphere() {
    if (!this.atmosphere || !this.ctx) return;
    const { source, gain } = this.atmosphere;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    try {
      source.stop(this.ctx.currentTime + 0.3);
    } catch {
      /* noop */
    }
    this.atmosphere = null;
  }

  private midiToHz(midi: number) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}

export const engine = new MusicEngine();

// Dev-only handle so tests can inspect the live audio graph.
if (import.meta.env?.DEV) {
  (window as unknown as { __engine?: MusicEngine }).__engine = engine;
}
