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

// Arpeggio stem — mid-register Gymnopédie fragment
// Base (8):  E4   D4   B3   A3   D4   C#4  B3   A3
const GYMNOPEDIE_ARP = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
];
// Bloom (16): adds ascending second half
const GYMNOPEDIE_ARP_BLOOM = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
  329.63, 369.99, 392.00, 440.00,
  493.88, 440.00, 392.00, 369.99,
];

// Per-ring voice config. octave: 0=normal, -1=×0.5 (down), -2=×0.25 (two down)
const RING_CFG = [
  { vol: 0.40, dur: 1.2, octave:  0 },  // 0: melody ring — soprano
  { vol: 0.25, dur: 1.0, octave:  0 },  // 1: outer — soprano, softer
  { vol: 0.20, dur: 1.4, octave: -1 },  // 2: middle — alto/tenor
  { vol: 0.16, dur: 2.0, octave: -2 },  // 3: inner — bass
];

// Drone pairs: each pitch gets two oscillators 0.3 Hz apart.
// The beating between them (~0.3 Hz = one pulse every 3 s) creates
// a slow, natural breath with no percussion needed.
// Dmaj7: D2(73.42) + A2(110.00)  |  Gmaj7: G2(98.00) + D3(146.83)
const DMAJ_BASES  = [[73.42, 0.10], [110.00, 0.07]];
const GMAJ_BASES  = [[98.00, 0.10], [146.83, 0.07]];
const DETUNE_OFFSET = 0.30;  // Hz between each pair

export class AudioEngine {
  constructor() {
    this._ctx            = new (window.AudioContext || window.webkitAudioContext)();
    this._drone          = [];     // {osc, gain, baseFreq, detuneOffset, baseVol}
    this._stemLevel      = 0;
    this._mirror         = false;
    this._arpTimer       = null;
    this._arpNext        = 0;
    this._arpIdx         = 0;
    this._baseInterval   = 0.75;
    this._arpInterval    = 0.75;
    this._melodyCursor   = 0;
    this._transportStart = 0;
    this._quantum        = 0.125;
    this._nextNoteAt     = 0;
    this._chordPhase     = 0;      // 0=Dmaj7 1=Gmaj7
    this._chordTimer     = null;
  }

  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  startAmbient() {
    if (this._drone.length) return;
    const ctx = this._ctx;
    this._transportStart = ctx.currentTime;
    this._nextNoteAt     = ctx.currentTime;

    DMAJ_BASES.forEach(([base, vol]) => {
      [0, DETUNE_OFFSET].forEach(offset => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = base + offset;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 5.0);
        osc.start();
        this._drone.push({ osc, gain, baseFreq: base, detuneOffset: offset, baseVol: vol });
      });
    });

    this._startChordCycle();
  }

  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    if (level === 1) {
      // Recognition: gentle harmonic layer — no rhythm pulse, just a soft overtone swell
      this._drone.forEach(d => {
        d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.3, ctx.currentTime + 3.0);
      });
    } else if (level === 2) {
      this._arpNext = ctx.currentTime + 1.0;
      this._scheduleArp();
    } else if (level === 3) {
      this._drone.forEach(d => {
        d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.6, ctx.currentTime + 3.0);
      });
    }
  }

  startMirror() {
    this._mirror      = true;
    this._arpInterval = this._baseInterval * 0.5;
    const ctx = this._ctx;
    this._drone.forEach(d => {
      d.osc.frequency.linearRampToValueAtTime(
        (d.baseFreq + d.detuneOffset) * 2, ctx.currentTime + 1.0,
      );
      d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.9, ctx.currentTime + 1.0);
    });
  }

  endMirror() {
    this._mirror      = false;
    this._arpInterval = this._baseInterval;
    const ctx   = this._ctx;
    const bright = this._stemLevel >= 3 ? 1.6 : this._stemLevel >= 1 ? 1.3 : 1.0;
    this._drone.forEach(d => {
      d.osc.frequency.linearRampToValueAtTime(d.baseFreq + d.detuneOffset, ctx.currentTime + 2.0);
      d.gain.gain.linearRampToValueAtTime(d.baseVol * bright, ctx.currentTime + 2.0);
    });
  }

  stop() {
    clearTimeout(this._arpTimer);
    clearTimeout(this._chordTimer);
    this._arpTimer = this._chordTimer = null;
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

  paddleTick() {
    const ctx  = this._get();
    const freq = this._chordPhase === 0 ? 293.66 : 392.00;
    this._tone(freq, 'sine', 0.04, ctx.currentTime, 0.07);
  }

  // Beat-trigger brick: simultaneous chord stab on current harmonic phase
  chordStab() {
    const ctx   = this._get();
    const now   = ctx.currentTime;
    const notes = this._chordPhase === 0
      ? [293.66, 369.99, 440.00]   // D4 F#4 A4  (Dmaj)
      : [392.00, 493.88, 587.33];  // G4 B4  D5  (Gmaj)
    notes.forEach((f, i) => {
      this._tone(f, 'sine', 0.09, now + i * 0.012, 0.40);
    });
  }

  // Coupled to ball speed — call every frame; mirror state applies half-speed on top
  setArpTempo(baseInterval) {
    this._baseInterval = baseInterval;
    this._arpInterval  = baseInterval * (this._mirror ? 0.5 : 1.0);
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(73.42,  'sine', 0.35, now, 2.5);
    this._tone(146.83, 'sine', 0.12, now, 1.5);
  }

  missTone() {
    const ctx  = this._get();
    const now  = ctx.currentTime;
    const [hi, lo] = this._chordPhase === 0
      ? [293.66, 220.00]
      : [392.00, 293.66];
    this._tone(hi, 'sine', 0.18, now,        0.35);
    this._tone(lo, 'sine', 0.10, now + 0.15, 0.50);
  }

  clearArpeggio() {
    const ctx = this._get();
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

  // ── Arpeggio — sine with overlapping decay for pad-like blend ──────────────

  _scheduleArp() {
    const ctx   = this._ctx;
    const notes = this._stemLevel >= 3 ? GYMNOPEDIE_ARP_BLOOM : GYMNOPEDIE_ARP;
    while (this._arpNext < ctx.currentTime + 0.3) {
      // Long attack (60 ms) + decay that overlaps the next note → notes blend like a held pedal
      this._tone(notes[this._arpIdx % notes.length], 'sine', 0.055, this._arpNext, 1.1, 0.06);
      this._arpIdx++;
      this._arpNext += this._arpInterval;
    }
    this._arpTimer = setTimeout(() => this._scheduleArp(), 100);
  }

  // ── Chord cycle — G↔D every 16 seconds, drone glides over 3 s ─────────────

  _startChordCycle() {
    const advance = () => {
      this._chordPhase = (this._chordPhase + 1) % 2;
      this._morphDrone();
      this._chordTimer = setTimeout(advance, 16000);
    };
    this._chordTimer = setTimeout(advance, 16000);
  }

  _morphDrone() {
    const bases  = this._chordPhase === 0 ? DMAJ_BASES : GMAJ_BASES;
    const bright = (this._stemLevel >= 3 ? 1.6 : this._stemLevel >= 1 ? 1.3 : 1.0)
                 * (this._mirror ? 1.9 : 1.0);
    const ctx    = this._ctx;
    this._drone.forEach((d, i) => {
      const [newBase, newVol] = bases[Math.floor(i / 2)];
      d.osc.frequency.linearRampToValueAtTime(newBase + d.detuneOffset, ctx.currentTime + 3.0);
      d.gain.gain.linearRampToValueAtTime(newVol * bright, ctx.currentTime + 3.0);
      d.baseFreq = newBase;
      d.baseVol  = newVol;
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _nextQuantum(fromTime) {
    const Q   = this._quantum;
    const pos = (fromTime - this._transportStart) / Q;
    return this._transportStart + Math.ceil(pos + 0.01) * Q;
  }

  _get() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // attack defaults to 12 ms; pass a longer value for smooth pad-style fades.
  _tone(freq, type, vol, startTime, dur, attack = 0.012) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
  }
}
