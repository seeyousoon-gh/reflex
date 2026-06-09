// Gymnopédie No. 1 (Satie) — D major: D E F# G A B C#
//
// Opening melody phrase (D4–E5 range) — shared melody cursor advances through
// this on every brick hit; ring controls octave and timbre, not pitch.
//
//  E5      D5      E5      B4      A4      A4      D5      C#5
//  B4      A4      G4      F#4     E4      D4      E4      F#4
const GYMNOPEDIE_MELODY = [
  659.25, 587.33, 659.25, 493.88, 440.00, 440.00, 587.33, 554.37,
  493.88, 440.00, 392.00, 369.99, 329.63, 293.66, 329.63, 369.99,
];

// Arpeggio stem — mid-register Gymnopédie fragment played as ambient background
// Base (8):  E4   D4   B3   A3   D4   C#4  B3   A3
const GYMNOPEDIE_ARP = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
];
// Bloom (16): adds ascending second half of phrase
const GYMNOPEDIE_ARP_BLOOM = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
  329.63, 369.99, 392.00, 440.00,
  493.88, 440.00, 392.00, 369.99,
];

// Per-ring voice config. octave: 0=normal, -1=one down (×0.5), -2=two down (×0.25)
//   melody ring → soprano, outer → soprano (softer), middle → alto, inner → bass
const RING_CFG = [
  { vol: 0.40, dur: 1.2, octave:  0 },
  { vol: 0.25, dur: 1.0, octave:  0 },
  { vol: 0.20, dur: 1.4, octave: -1 },
  { vol: 0.16, dur: 2.0, octave: -2 },
];

export class AudioEngine {
  constructor() {
    this._ctx            = new (window.AudioContext || window.webkitAudioContext)();
    this._drone          = [];      // [{osc, gain, baseFreq, baseVol}]
    this._stemLevel      = 0;
    this._mirror         = false;
    this._rhythmTimer    = null;
    this._rhythmNext     = 0;
    this._arpTimer       = null;
    this._arpNext        = 0;
    this._arpIdx         = 0;
    this._arpInterval    = 0.75;   // seconds per note (Gymnopédie ~40 bpm)
    this._melodyCursor   = 0;      // shared position in GYMNOPEDIE_MELODY
    this._transportStart = 0;      // AudioContext time of first launch
    this._quantum        = 0.125;  // grid slot — 125 ms ≈ 16th note @ 120 bpm
    this._nextNoteAt     = 0;      // next available brick-note slot on grid
    this._chordPhase     = 0;      // 0=Dmaj7 1=Gmaj7
    this._chordTimer     = null;
  }

  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // Call on ball launch — starts drone, transport clock, and chord cycle.
  startAmbient() {
    if (this._drone.length) return;
    const ctx = this._ctx;
    this._transportStart = ctx.currentTime;
    this._nextNoteAt     = ctx.currentTime;

    // D2 (73.42) + A2 (110.00) — open fifth, Dmaj7 root position
    [[73.42, 0.16], [110.00, 0.10]].forEach(([freq, vol]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 4.0);
      osc.start();
      this._drone.push({ osc, gain, baseFreq: freq, baseVol: vol });
    });

    this._startChordCycle();
  }

  // level: 1=Recognition 2=Deepening 3=Transcendence
  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    if (level === 1) {
      this._rhythmNext = ctx.currentTime + 0.5;
      this._scheduleRhythm();
    } else if (level === 2) {
      this._arpNext = ctx.currentTime + 0.5;
      this._scheduleArp();
    } else if (level === 3) {
      this._drone.forEach(d => {
        d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.5, ctx.currentTime + 2.0);
      });
    }
  }

  startMirror() {
    this._mirror      = true;
    this._arpInterval = 0.375;
    const ctx = this._ctx;
    this._drone.forEach(d => {
      d.osc.frequency.linearRampToValueAtTime(d.baseFreq * 2, ctx.currentTime + 1.0);
      d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.9, ctx.currentTime + 1.0);
    });
  }

  endMirror() {
    this._mirror      = false;
    this._arpInterval = 0.75;
    const ctx   = this._ctx;
    const bright = this._stemLevel >= 3 ? 1.5 : 1.0;
    this._drone.forEach(d => {
      d.osc.frequency.linearRampToValueAtTime(d.baseFreq, ctx.currentTime + 1.5);
      d.gain.gain.linearRampToValueAtTime(d.baseVol * bright, ctx.currentTime + 1.5);
    });
  }

  stop() {
    clearTimeout(this._rhythmTimer);
    clearTimeout(this._arpTimer);
    clearTimeout(this._chordTimer);
    this._rhythmTimer = this._arpTimer = this._chordTimer = null;
    const ctx = this._ctx;
    this._drone.forEach(d => {
      d.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      d.osc.stop(ctx.currentTime + 1.6);
    });
    this._drone        = [];
    this._stemLevel    = 0;
    this._mirror       = false;
    this._melodyCursor = 0;
    this._chordPhase   = 0;
  }

  // ── Per-event sounds ────────────────────────────────────────────────────────

  // Every brick hit advances the shared melody cursor one step.
  // The ring determines octave (soprano/alto/bass), not pitch.
  // Hits snap to the 125ms transport grid so bursts land in time.
  brickNote(waveType = 'sine', ringIdx = 1) {
    const ctx = this._get();
    const now = ctx.currentTime;

    const gridSlot   = this._nextQuantum(now);
    this._nextNoteAt = Math.max(this._nextNoteAt, gridSlot);
    if (this._nextNoteAt - now > 0.5) return;
    const t = this._nextNoteAt;
    this._nextNoteAt += this._quantum;

    const baseFreq = GYMNOPEDIE_MELODY[this._melodyCursor % GYMNOPEDIE_MELODY.length];
    this._melodyCursor++;

    const cfg  = RING_CFG[ringIdx] ?? RING_CFG[1];
    const freq = baseFreq * (2 ** cfg.octave);

    this._tone(freq, waveType, cfg.vol, t, cfg.dur);
    if (ringIdx <= 1) this._tone(freq * 2, waveType, cfg.vol * 0.08, t, cfg.dur * 0.5);
  }

  // Chord-aware paddle tick — root of current chord
  paddleTick() {
    const ctx  = this._get();
    const freq = this._chordPhase === 0 ? 293.66 : 392.00;  // D4 or G4
    this._tone(freq, 'sine', 0.04, ctx.currentTime, 0.07);
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(73.42,  'sine', 0.35, now, 2.5);
    this._tone(146.83, 'sine', 0.12, now, 1.5);
  }

  // Chord-aware miss — descends by a fifth within current chord
  missTone() {
    const ctx  = this._get();
    const now  = ctx.currentTime;
    const [hi, lo] = this._chordPhase === 0
      ? [293.66, 220.00]   // D4→A3 over Dmaj
      : [392.00, 293.66];  // G4→D4 over Gmaj
    this._tone(hi, 'sine', 0.18, now,        0.35);
    this._tone(lo, 'sine', 0.10, now + 0.15, 0.50);
  }

  clearArpeggio() {
    const ctx = this._get();
    // D major triad ascending: D4 F#4 A4 D5 A5
    [293.66, 369.99, 440.00, 587.33, 880.00].forEach((f, i) => {
      this._tone(f, 'sine', 0.28, ctx.currentTime + i * 0.12, 0.9);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(146.83, 'sine', 0.28, now,       3.0);
    this._tone(110.00, 'sine', 0.14, now + 0.2, 2.5);
  }

  // ── Schedulers — lookahead pattern for accurate timing ─────────────────────

  _scheduleRhythm() {
    const ctx      = this._ctx;
    const interval = this._mirror ? 0.25 : 0.5;
    const freq     = this._chordPhase === 0 ? 293.66 : 392.00;
    while (this._rhythmNext < ctx.currentTime + 0.3) {
      this._tone(freq, 'sine', 0.025, this._rhythmNext, 0.07);
      this._rhythmNext += interval;
    }
    this._rhythmTimer = setTimeout(() => this._scheduleRhythm(), 100);
  }

  _scheduleArp() {
    const ctx   = this._ctx;
    const notes = this._stemLevel >= 3 ? GYMNOPEDIE_ARP_BLOOM : GYMNOPEDIE_ARP;
    while (this._arpNext < ctx.currentTime + 0.3) {
      this._tone(notes[this._arpIdx % notes.length], 'triangle', 0.07, this._arpNext, 0.55);
      this._arpIdx++;
      this._arpNext += this._arpInterval;
    }
    this._arpTimer = setTimeout(() => this._scheduleArp(), 100);
  }

  // ── Chord cycle — G↔D every 8 seconds, drone glides between roots ──────────

  _startChordCycle() {
    const advance = () => {
      this._chordPhase = (this._chordPhase + 1) % 2;
      this._morphDrone();
      this._chordTimer = setTimeout(advance, 8000);
    };
    this._chordTimer = setTimeout(advance, 8000);
  }

  _morphDrone() {
    // Dmaj7: D2(73.42) + A2(110.00)   Gmaj7: G2(98.00) + D3(146.83)
    const targets = this._chordPhase === 0
      ? [[73.42, 0.16], [110.00, 0.10]]
      : [[98.00, 0.16], [146.83, 0.10]];
    const bright  = (this._stemLevel >= 3 ? 1.5 : 1.0) * (this._mirror ? 1.9 : 1.0);
    const ctx     = this._ctx;
    this._drone.forEach((d, i) => {
      d.osc.frequency.linearRampToValueAtTime(
        this._mirror ? targets[i][0] * 2 : targets[i][0], ctx.currentTime + 2.0,
      );
      d.gain.gain.linearRampToValueAtTime(targets[i][1] * bright, ctx.currentTime + 2.0);
      d.baseFreq = targets[i][0];
      d.baseVol  = targets[i][1];
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  // Returns the next grid-aligned AudioContext time after fromTime.
  _nextQuantum(fromTime) {
    const Q   = this._quantum;
    const pos = (fromTime - this._transportStart) / Q;
    return this._transportStart + Math.ceil(pos + 0.01) * Q;
  }

  _get() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  _tone(freq, type, vol, startTime, dur) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
  }
}
