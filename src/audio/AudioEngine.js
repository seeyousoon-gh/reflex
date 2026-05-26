// Gymnopédie No. 1 (Satie) — D major: D E F# G A B C#
// Arpeggio plays the opening melodic phrase in the mid register.
// Base phrase (8 notes): E4 D4 B3 A3 D4 C#4 B3 A3
const GYMNOPEDIE_ARP = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
];
// Bloom phrase (16 notes): adds ascending second half
const GYMNOPEDIE_ARP_BLOOM = [
  329.63, 293.66, 246.94, 220.00,
  293.66, 277.18, 246.94, 220.00,
  329.63, 369.99, 392.00, 440.00,
  493.88, 440.00, 392.00, 369.99,
];

export class AudioEngine {
  constructor() {
    this._ctx         = new (window.AudioContext || window.webkitAudioContext)();
    this._drone       = [];    // [{osc, gain, baseFreq, baseVol}]
    this._stemLevel   = 0;    // 0=none 1=rhythm 2=arp 3=bloom
    this._mirror      = false;
    this._rhythmTimer = null;
    this._rhythmNext  = 0;
    this._arpTimer    = null;
    this._arpNext     = 0;
    this._arpIdx      = 0;
    this._arpInterval = 0.75;  // seconds per note (~40 bpm, Gymnopédie tempo)
    this._nextNoteAt  = 0;     // AudioContext time of next available brick-note slot
  }

  // Call inside a user-gesture handler (pointerdown) to unlock iOS audio.
  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // Call when ball launches — fades in D2+A2 open-fifth drone over 4 s.
  startAmbient() {
    if (this._drone.length) return;
    const ctx = this._ctx;
    [[73.42, 0.16], [110.00, 0.10]].forEach(([freq, vol]) => {  // D2, A2
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
  }

  // level: 1=Recognition (rhythm), 2=Deepening (Gymnopédie arp), 3=Transcendence (bloom)
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
    this._arpInterval = 0.375;  // double tempo
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

  // Fade out all stems — call on level clear or game over.
  stop() {
    clearTimeout(this._rhythmTimer);
    clearTimeout(this._arpTimer);
    this._rhythmTimer = null;
    this._arpTimer    = null;
    const ctx = this._ctx;
    this._drone.forEach(d => {
      d.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      d.osc.stop(ctx.currentTime + 1.6);
    });
    this._drone     = [];
    this._stemLevel = 0;
    this._mirror    = false;
  }

  // ── Per-event sounds ────────────────────────────────────────────────────────

  // freq: exact Hz. ringIdx: 0=melody-outer 1=outer 2=middle 3=inner.
  // Rapid-fire hits are spaced 65 ms apart so bursts strum rather than smash.
  brickNote(freq, waveType = 'sine', ringIdx = 1) {
    const ctx = this._get();
    const now = ctx.currentTime;

    this._nextNoteAt = Math.max(this._nextNoteAt, now);
    if (this._nextNoteAt - now > 0.3) return;
    const t = this._nextNoteAt;
    this._nextNoteAt += 0.065;

    const dur = [1.2, 1.0, 1.4, 2.0][ringIdx] ?? 1.0;
    const vol = [0.42, 0.34, 0.28, 0.22][ringIdx] ?? 0.30;
    this._tone(freq, waveType, vol, t, dur);
    // Octave shimmer on melody ring and outer ring
    if (ringIdx <= 1) this._tone(freq * 2, waveType, vol * 0.08, t, dur * 0.5);
  }

  paddleTick() {
    const ctx = this._get();
    this._tone(293.66, 'sine', 0.04, ctx.currentTime, 0.07);  // D4 — softer tick
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(73.42,  'sine', 0.35, now,  2.5);   // D2 deep resonance
    this._tone(146.83, 'sine', 0.12, now,  1.5);   // D3 overtone
  }

  missTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(293.66, 'sine', 0.18, now,        0.35);  // D4
    this._tone(246.94, 'sine', 0.12, now + 0.12, 0.50);  // B3 — step down
  }

  clearArpeggio() {
    const ctx = this._get();
    // D major ascending: D4 F#4 A4 D5 F#5
    [293.66, 369.99, 440.00, 587.33, 739.99].forEach((f, i) => {
      this._tone(f, 'sine', 0.28, ctx.currentTime + i * 0.11, 0.9);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(146.83, 'sine', 0.28, now,       3.0);   // D3
    this._tone(110.00, 'sine', 0.14, now + 0.2, 2.5);   // A2 — descent
  }

  // ── Schedulers — lookahead pattern for accurate timing ─────────────────────

  _scheduleRhythm() {
    const ctx      = this._ctx;
    const interval = this._mirror ? 0.25 : 0.5;
    while (this._rhythmNext < ctx.currentTime + 0.3) {
      this._tone(293.66, 'sine', 0.025, this._rhythmNext, 0.07);  // D4 soft pulse
      this._rhythmNext += interval;
    }
    this._rhythmTimer = setTimeout(() => this._scheduleRhythm(), 100);
  }

  _scheduleArp() {
    const ctx   = this._ctx;
    const notes = this._stemLevel >= 3 ? GYMNOPEDIE_ARP_BLOOM : GYMNOPEDIE_ARP;
    while (this._arpNext < ctx.currentTime + 0.3) {
      const freq = notes[this._arpIdx % notes.length];
      this._tone(freq, 'triangle', 0.07, this._arpNext, 0.55);
      this._arpIdx++;
      this._arpNext += this._arpInterval;
    }
    this._arpTimer = setTimeout(() => this._scheduleArp(), 100);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

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
