// D minor pentatonic: D F G A C, three octaves
// Outer ring (crystal) → upper register, bright sine
// Middle ring (amber)  → mid register, warm triangle
// Inner ring (void)    → lower register, deep sine
const SCALES = [
  [587.33, 698.46, 784.00, 880.00, 1046.50],  // outer  D5 F5 G5 A5 C6
  [293.66, 349.23, 392.00, 440.00,  523.25],  // middle D4 F4 G4 A4 C5
  [146.83, 174.61, 196.00, 220.00,  261.63],  // inner  D3 F3 G3 A3 C4
];

export class AudioEngine {
  constructor() {
    this._ctx = null;
  }

  // Call inside a user-gesture handler (pointerdown) to unlock iOS audio.
  unlock() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // ring 0=outer 1=middle 2=inner, noteIdx 0-4, waveType for oscillator
  brickNote(ring, noteIdx, waveType = 'sine') {
    const ctx  = this._get();
    if (!ctx) return;
    const freq = SCALES[ring][noteIdx % 5];
    const now  = ctx.currentTime;
    const dur  = [1.0, 1.4, 2.0][ring];
    const vol  = [0.34, 0.28, 0.22][ring];
    this._tone(freq, waveType, vol, now, dur);
    // Subtle octave shimmer on outer crystal hits
    if (ring === 0) this._tone(freq * 2, waveType, vol * 0.10, now, dur * 0.5);
  }

  paddleTick() {
    const ctx = this._get();
    if (!ctx) return;
    this._tone(220, 'sine', 0.05, ctx.currentTime, 0.07);
  }

  corePing() {
    const ctx = this._get();
    if (!ctx) return;
    const now = ctx.currentTime;
    this._tone(73.42, 'sine', 0.35, now, 2.5);   // D2 deep resonance
    this._tone(146.83, 'sine', 0.12, now, 1.5);  // D3 overtone
  }

  missTone() {
    const ctx = this._get();
    if (!ctx) return;
    const now = ctx.currentTime;
    this._tone(293.66, 'sine', 0.18, now, 0.30);        // D4
    this._tone(246.94, 'sine', 0.12, now + 0.10, 0.45); // B3 — minor fall
  }

  clearArpeggio() {
    const ctx = this._get();
    if (!ctx) return;
    [293.66, 392.00, 440.00, 587.33, 784.00].forEach((f, i) => {
      this._tone(f, 'sine', 0.28, ctx.currentTime + i * 0.11, 0.9);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    if (!ctx) return;
    const now = ctx.currentTime;
    this._tone(146.83, 'sine', 0.28, now, 3.0);
    this._tone(130.81, 'sine', 0.14, now + 0.2, 2.5);
  }

  _get() {
    if (!this._ctx) return null;
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
