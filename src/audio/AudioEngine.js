// D minor pentatonic: D F G A C, three octaves
const SCALES = [
  [587.33, 698.46, 784.00, 880.00, 1046.50],  // outer  D5 F5 G5 A5 C6
  [293.66, 349.23, 392.00, 440.00,  523.25],  // middle D4 F4 G4 A4 C5
  [146.83, 174.61, 196.00, 220.00,  261.63],  // inner  D3 F3 G3 A3 C4
];

const ARP_BASE  = [293.66, 349.23, 392.00, 440.00];                   // D4 F4 G4 A4
const ARP_BLOOM = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33];   // + C5 D5

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
    this._nextNoteAt  = 0;    // AudioContext time of next available note slot
  }

  // Call inside a user-gesture handler (pointerdown) to unlock iOS audio.
  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // Call when ball launches — fades in the base drone over 4 s.
  startAmbient() {
    if (this._drone.length) return;
    const ctx = this._ctx;
    [[73.42, 0.18], [146.83, 0.10]].forEach(([freq, vol]) => {
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

  // level: 1=Recognition (rhythm pulse), 2=Deepening (arpeggio), 3=Transcendence (bloom)
  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    if (level === 1) {
      this._rhythmNext = ctx.currentTime + 0.5;
      this._scheduleRhythm();
    } else if (level === 2) {
      this._arpNext = ctx.currentTime + 0.25;
      this._scheduleArp();
    } else if (level === 3) {
      // Brighten drone slightly when bloom unlocks
      this._drone.forEach(d => {
        d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.4, ctx.currentTime + 2.0);
      });
    }
  }

  startMirror() {
    this._mirror = true;
    const ctx = this._ctx;
    this._drone.forEach(d => {
      d.osc.frequency.linearRampToValueAtTime(d.baseFreq * 2, ctx.currentTime + 1.0);
      d.gain.gain.linearRampToValueAtTime(d.baseVol * 1.8, ctx.currentTime + 1.0);
    });
  }

  endMirror() {
    this._mirror = false;
    const ctx = this._ctx;
    const bright = this._stemLevel >= 3 ? 1.4 : 1.0;
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

  // ring 0=outer 1=middle 2=inner, noteIdx 0-4, waveType for oscillator.
  // Rapid-fire hits are spaced 65 ms apart so bursts strum rather than smash.
  brickNote(ring, noteIdx, waveType = 'sine') {
    const ctx  = this._get();
    const now  = ctx.currentTime;

    // Advance the note slot; reset to now when the queue has caught up
    this._nextNoteAt = Math.max(this._nextNoteAt, now);
    // Drop the note if the queue is already 300 ms deep — burst is over
    if (this._nextNoteAt - now > 0.3) return;
    const t = this._nextNoteAt;
    this._nextNoteAt += 0.065;

    const freq = SCALES[ring][noteIdx % 5];
    const dur  = [1.0, 1.4, 2.0][ring];
    const vol  = [0.34, 0.28, 0.22][ring];
    this._tone(freq, waveType, vol, t, dur);
    if (ring === 0) this._tone(freq * 2, waveType, vol * 0.10, t, dur * 0.5);
  }

  paddleTick() {
    const ctx = this._get();
    this._tone(220, 'sine', 0.05, ctx.currentTime, 0.07);
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(73.42,  'sine', 0.35, now,        2.5);
    this._tone(146.83, 'sine', 0.12, now,        1.5);
  }

  missTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(293.66, 'sine', 0.18, now,        0.30);
    this._tone(246.94, 'sine', 0.12, now + 0.10, 0.45);
  }

  clearArpeggio() {
    const ctx = this._get();
    [293.66, 392.00, 440.00, 587.33, 784.00].forEach((f, i) => {
      this._tone(f, 'sine', 0.28, ctx.currentTime + i * 0.11, 0.9);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(146.83, 'sine', 0.28, now,       3.0);
    this._tone(130.81, 'sine', 0.14, now + 0.2, 2.5);
  }

  // ── Schedulers — lookahead pattern for accurate timing ─────────────────────

  _scheduleRhythm() {
    const ctx      = this._ctx;
    const interval = this._mirror ? 0.25 : 0.5;
    while (this._rhythmNext < ctx.currentTime + 0.3) {
      this._tone(220, 'sine', 0.03, this._rhythmNext, 0.06);
      this._rhythmNext += interval;
    }
    this._rhythmTimer = setTimeout(() => this._scheduleRhythm(), 100);
  }

  _scheduleArp() {
    const ctx      = this._ctx;
    const notes    = this._stemLevel >= 3 ? ARP_BLOOM : ARP_BASE;
    const interval = this._mirror ? 0.25 : 0.5;
    while (this._arpNext < ctx.currentTime + 0.3) {
      const freq = notes[this._arpIdx % notes.length];
      this._tone(freq, 'triangle', 0.07, this._arpNext, 0.35);
      this._arpIdx++;
      this._arpNext += interval;
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
