// Ode to Joy — F# minor (dark, hypnotic version matching reference)
// F#4  F#4  G#4  A4   A4   G#4  F#4  E4   D#4  D#4  E4   F#4  F#4  E4   E4   F#4
const ODE_MELODY = [
  369.99, 369.99, 415.30, 440.00, 440.00, 415.30, 369.99, 329.63,
  311.13, 311.13, 329.63, 369.99, 369.99, 329.63, 329.63, 369.99,
];

// Per-ring lead voice: triangle for warmth
const RING_CFG = [
  { vol: 0.26, dur: 0.9,  octave:  0 },
  { vol: 0.17, dur: 0.8,  octave:  0 },
  { vol: 0.13, dur: 1.1,  octave: -1 },
  { vol: 0.10, dur: 1.6,  octave: -2 },
];

// Bass grid — F# minor groove
// F#2=92.50  A2=110.00  G2=98.00  A#2=116.54  E2=82.41  A1=55.00
const BASS_NOTES = [
   92.50,  92.50, 110.00,  98.00,   // F# F# A  G
   92.50,  82.41,  92.50,  55.00,   // F# E  F# A(deep)
   92.50, 110.00,  98.00, 110.00,   // F# A  G  A
  116.54, 110.00,  98.00,  92.50,   // A# A  G  F#
];

export class AudioEngine {
  constructor() {
    this._ctx          = new (window.AudioContext || window.webkitAudioContext)();
    this._bpm          = 112;
    this._step         = 0;
    this._nextStepAt   = 0;
    this._clockTimer   = null;
    this._melodyCursor = 0;
    this._stemLevel    = 0;
    this._mirror       = false;
    this._pad          = null;
    this._noiseBuf     = null;

    // Kick on 1 and 3 (two-step), 8th-note hi-hats on the "and" of each beat
    this._seq = {
      kick:  this._makeSeq([0, 8]),
      snare: this._makeSeq([]),
      hihat: this._makeSeq([2, 6, 10, 14]),
      ohat:  this._makeSeq([]),
      bass:  this._makeSeq([]),
    };
  }

  _makeSeq(seeds) {
    return Array.from({ length: 16 }, (_, i) => seeds.includes(i));
  }

  get _stepLen() { return 60 / this._bpm / 4; }

  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  startAmbient() {
    if (this._clockTimer) return;
    const ctx = this._ctx;
    this._nextStepAt = ctx.currentTime + 0.1;
    this._tick();
    this._startPad();
  }

  _startPad() {
    const ctx = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 185.00;  // F#3 — dark minor foundation
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.040, ctx.currentTime + 9);
    osc.start();
    this._pad = { osc, gain, baseVol: 0.040 };
  }

  // ── Sequencer clock ────────────────────────────────────────────────────────

  _tick() {
    const ctx = this._ctx;
    while (this._nextStepAt < ctx.currentTime + 0.10) {
      this._schedStep(this._step, this._nextStepAt);
      this._step = (this._step + 1) % 16;
      this._nextStepAt += this._stepLen;
    }
    this._clockTimer = setTimeout(() => this._tick(), 25);
  }

  _schedStep(step, t) {
    if (this._seq.kick[step])  this._kick(t);
    if (this._seq.snare[step]) this._snare(t);
    if (this._seq.hihat[step]) this._hihat(t, false);
    if (this._seq.ohat[step])  this._hihat(t, true);
    if (this._seq.bass[step])  this._bassNote(t, BASS_NOTES[step], this._stepLen * 0.85);
  }

  // ── Game → sequencer wiring ────────────────────────────────────────────────

  // 95–125 BPM: deep/hypnotic feel around the 112 BPM reference
  setBPM(bpm) {
    this._bpm = Math.max(95, Math.min(125, Math.round(bpm)));
  }

  activateStep(ringIdx, stepIdx) {
    const map = ['hihat', 'kick', 'bass', 'ohat'];
    const track = map[ringIdx];
    if (!track) return;
    this._seq[track][stepIdx] = true;
    if (ringIdx === 1 && (stepIdx === 4 || stepIdx === 12)) {
      this._seq.snare[stepIdx] = true;
    }
  }

  wallHit(side) {
    const t = this._ctx.currentTime + 0.005;
    if (side === 'top')       this._rimshot(t);
    else if (side === 'left') this._hihat(t, false);
    else                      this._hihat(t, true);
  }

  // ── Stem unlocks ───────────────────────────────────────────────────────────

  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    if (level === 1 && this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(this._pad.baseVol * 1.5, ctx.currentTime + 3);
    } else if (level === 2) {
      this._seq.snare[4]  = true;
      this._seq.snare[12] = true;
    } else if (level === 3 && this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(this._pad.baseVol * 2.0, ctx.currentTime + 3);
    }
  }

  startMirror() {
    this._mirror = true;
    // Full 16th-note hi-hat grid — maximum density
    for (let i = 0; i < 16; i++) this._seq.hihat[i] = true;
    if (this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(
        this._pad.baseVol * 2.4, this._ctx.currentTime + 1.0,
      );
    }
  }

  endMirror() {
    this._mirror = false;
  }

  stop() {
    if (this._clockTimer) { clearTimeout(this._clockTimer); this._clockTimer = null; }
    const ctx = this._ctx;
    if (this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      this._pad.osc.stop(ctx.currentTime + 1.3);
      this._pad = null;
    }
    this._step         = 0;
    this._melodyCursor = 0;
    this._stemLevel    = 0;
    this._mirror       = false;
    this._seq = {
      kick:  this._makeSeq([0, 8]),
      snare: this._makeSeq([]),
      hihat: this._makeSeq([2, 6, 10, 14]),
      ohat:  this._makeSeq([]),
      bass:  this._makeSeq([]),
    };
  }

  // ── Per-event sounds ───────────────────────────────────────────────────────

  brickNote(waveType = 'triangle', ringIdx = 1) {
    const ctx  = this._get();
    const cfg  = RING_CFG[ringIdx] ?? RING_CFG[1];
    const freq = ODE_MELODY[this._melodyCursor % ODE_MELODY.length] * (2 ** cfg.octave);
    this._melodyCursor++;
    this._tone(freq, 'triangle', cfg.vol, ctx.currentTime + 0.005, cfg.dur, 0.008);
  }

  paddleTick() {
    this._kick(this._ctx.currentTime + 0.005);
  }

  chordStab() {
    const ctx = this._get();
    const now = ctx.currentTime;
    // F# minor tonic: F#4, A4, C#5
    [369.99, 440.00, 554.37].forEach((f, i) => {
      this._tone(f, 'triangle', 0.07, now + i * 0.012, 0.38);
    });
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'triangle', 0.28, now, 2.0);  // F#3
    this._tone(369.99, 'sine',     0.09, now, 1.2);  // F#4
  }

  missTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'sine', 0.14, now,        0.30);
    this._tone(138.59, 'sine', 0.07, now + 0.18, 0.45);  // C#3
  }

  clearArpeggio() {
    const ctx = this._get();
    // Ascending F# minor arpeggio
    [185.00, 220.00, 277.18, 369.99, 440.00].forEach((f, i) => {
      this._tone(f, 'triangle', 0.22, ctx.currentTime + i * 0.10, 0.8);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'sine', 0.22, now,       2.8);
    this._tone(138.59, 'sine', 0.10, now + 0.2, 2.2);
  }

  setArpTempo() {}  // legacy stub

  // ── Percussion synthesis ───────────────────────────────────────────────────

  _kick(t) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Deep sub-kick: starts at 90Hz, drops quickly to 28Hz
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.08);
    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  _snare(t) {
    const ctx = this._ctx;
    const buf = this._getNoise();

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.start(t, Math.random() * 0.5);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1800;  // slightly darker than before
    filt.Q.value = 0.85;
    const ng = ctx.createGain();
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(ctx.destination);
    ng.gain.setValueAtTime(0.38, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    noise.stop(t + 0.16);

    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.connect(og);
    og.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = 160;
    og.gain.setValueAtTime(0.20, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  _hihat(t, open = false) {
    const ctx   = this._ctx;
    const buf   = this._getNoise();
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.start(t, Math.random() * 0.5);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 8000;
    const gain = ctx.createGain();
    noise.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    const dur = open ? 0.10 : 0.028;
    gain.gain.setValueAtTime(0.17, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.stop(t + dur + 0.01);
  }

  _rimshot(t) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 680;
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.040);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  // Deep sub-bass: triangle fundamental + pure sine sub-octave
  _bassNote(t, freq, dur) {
    const ctx  = this._ctx;

    // Fundamental — triangle for warmth
    const osc  = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.value = 360;  // round off harmonics
    filt.Q.value = 2.0;
    gain.gain.setValueAtTime(0.34, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.01);

    // Sub-octave — pure sine for depth
    const sub  = ctx.createOscillator();
    const subg = ctx.createGain();
    sub.connect(subg);
    subg.connect(ctx.destination);
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    subg.gain.setValueAtTime(0.20, t);
    subg.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.75);
    sub.start(t);
    sub.stop(t + dur + 0.01);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _getNoise() {
    if (!this._noiseBuf) {
      const ctx = this._ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    return this._noiseBuf;
  }

  _get() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  _tone(freq, type, vol, t, dur, attack = 0.010) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
