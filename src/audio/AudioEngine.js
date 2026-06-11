// Ode to Joy melody — D major, played through on every brick hit (ring sets octave)
const ODE_MELODY = [
  293.66, 293.66, 329.63, 369.99, 369.99, 329.63, 293.66, 277.18,
  246.94, 246.94, 277.18, 293.66, 293.66, 277.18, 277.18, 293.66,
];

// Per-ring lead voice: triangle wave for PS1 synth texture
const RING_CFG = [
  { vol: 0.32, dur: 0.9, octave:  0 },  // 0: melody ring — soprano
  { vol: 0.20, dur: 0.8, octave:  0 },  // 1: outer
  { vol: 0.16, dur: 1.1, octave: -1 },  // 2: middle — alto
  { vol: 0.12, dur: 1.6, octave: -2 },  // 3: inner — bass
];

// Sawtooth rolling bassline — one note per sequencer step (D major)
// D2  D2  D2  E2   D2  A1  F#2 D2   A1  D2  D2  G2   D2  E2  A1  D2
const BASS_NOTES = [
  73.42, 73.42, 73.42, 82.41,
  73.42, 55.00, 92.50, 73.42,
  55.00, 73.42, 73.42, 98.00,
  73.42, 82.41, 55.00, 73.42,
];

export class AudioEngine {
  constructor() {
    this._ctx          = new (window.AudioContext || window.webkitAudioContext)();
    this._bpm          = 120;
    this._step         = 0;
    this._nextStepAt   = 0;
    this._clockTimer   = null;
    this._melodyCursor = 0;
    this._stemLevel    = 0;
    this._mirror       = false;
    this._pad          = null;
    this._noiseBuf     = null;

    // 16-step sequencer — kick seeded on beats 0 and 8 (minimal DnB two-step)
    this._seq = {
      kick:  this._makeSeq([0, 8]),
      snare: this._makeSeq([]),
      hihat: this._makeSeq([]),
      ohat:  this._makeSeq([]),
      bass:  this._makeSeq([]),
    };
  }

  _makeSeq(seeds) {
    return Array.from({ length: 16 }, (_, i) => seeds.includes(i));
  }

  get _stepLen() { return 60 / this._bpm / 4; }   // 16th-note duration in seconds

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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 146.83;  // D3 — warm, unobtrusive foundation
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.038, ctx.currentTime + 9);
    osc.start();
    this._pad = { osc, gain, baseVol: 0.038 };
  }

  // ── Sequencer clock (lookahead scheduler) ──────────────────────────────────

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
    if (this._seq.bass[step])  this._bassNote(t, BASS_NOTES[step], this._stepLen * 0.88);
  }

  // ── Game → sequencer wiring ────────────────────────────────────────────────

  setBPM(bpm) {
    this._bpm = Math.max(90, Math.min(155, Math.round(bpm)));
  }

  // Brick destruction permanently activates that brick's step in its track
  activateStep(ringIdx, stepIdx) {
    const map = ['hihat', 'kick', 'bass', 'ohat'];
    const track = map[ringIdx];
    if (!track) return;
    this._seq[track][stepIdx] = true;
    // Outer ring also seeds snare on beat positions 4 and 12
    if (ringIdx === 1 && (stepIdx === 4 || stepIdx === 12)) {
      this._seq.snare[stepIdx] = true;
    }
  }

  // Wall bounce → immediate one-shot percussion
  wallHit(side) {
    const t = this._ctx.currentTime + 0.005;
    if (side === 'top')        this._rimshot(t);
    else if (side === 'left')  this._hihat(t, false);
    else                       this._hihat(t, true);
  }

  // ── Stem unlocks ───────────────────────────────────────────────────────────

  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    if (level === 1 && this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(this._pad.baseVol * 1.5, ctx.currentTime + 3);
    } else if (level === 2) {
      // Auto-seed snare backbeat at beat positions 4 and 12
      this._seq.snare[4]  = true;
      this._seq.snare[12] = true;
    } else if (level === 3 && this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(this._pad.baseVol * 2.0, ctx.currentTime + 3);
    }
  }

  startMirror() {
    this._mirror = true;
    // Add rolling 8th-note hi-hats — the player earned this pattern
    for (let i = 0; i < 16; i += 2) this._seq.hihat[i] = true;
    if (this._pad) {
      this._pad.gain.gain.linearRampToValueAtTime(
        this._pad.baseVol * 2.4, this._ctx.currentTime + 1.0,
      );
    }
  }

  endMirror() {
    this._mirror = false;
    // Hi-hat pattern and pad level remain — they were earned through play
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
      hihat: this._makeSeq([]),
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
    [293.66, 369.99, 440.00].forEach((f, i) => {
      this._tone(f, 'triangle', 0.08, now + i * 0.012, 0.38);
    });
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(146.83, 'triangle', 0.30, now, 2.0);
    this._tone(293.66, 'sine',     0.10, now, 1.2);
  }

  missTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(220.00, 'sine', 0.16, now,        0.30);
    this._tone(164.81, 'sine', 0.08, now + 0.15, 0.45);
  }

  clearArpeggio() {
    const ctx = this._get();
    [293.66, 369.99, 440.00, 587.33, 880.00].forEach((f, i) => {
      this._tone(f, 'triangle', 0.22, ctx.currentTime + i * 0.10, 0.8);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(146.83, 'sine', 0.25, now,       2.8);
    this._tone(110.00, 'sine', 0.12, now + 0.2, 2.2);
  }

  // Legacy stub — BPM is now driven by setBPM() from ball speed
  setArpTempo() {}

  // ── PS1 percussion synthesis ───────────────────────────────────────────────

  _kick(t) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + 0.075);
    gain.gain.setValueAtTime(0.88, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  _snare(t) {
    const ctx  = this._ctx;
    const buf  = this._getNoise();

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.start(t, Math.random() * 0.5);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2200;
    filt.Q.value = 0.9;
    const ng = ctx.createGain();
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(ctx.destination);
    ng.gain.setValueAtTime(0.40, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    noise.stop(t + 0.15);

    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.connect(og);
    og.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.value = 185;
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
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
    filt.frequency.value = 8500;
    const gain = ctx.createGain();
    noise.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    const dur = open ? 0.11 : 0.032;
    gain.gain.setValueAtTime(0.20, t);
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
    osc.frequency.value = 750;
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  _bassNote(t, freq, dur) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.value = 520;
    filt.Q.value = 3.5;
    gain.gain.setValueAtTime(0.30, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.01);
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
