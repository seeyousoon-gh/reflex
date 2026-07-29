// ─────────────────────────────────────────────────────────────────────────────
//  REFLEX audio — F# minor generative sequencer
//
//  Signal flow:
//    drum / bass / lead / pad buses ──> master ──> lowpass ──> limiter ──> out
//                                          ▲
//                        reverb return ────┘
//
//  Every voice is gain-staged to sit under the limiter, and every envelope has a
//  real attack ramp — instantaneous gain steps produce broadband clicks.
// ─────────────────────────────────────────────────────────────────────────────

// F# minor pentatonic across ~2.5 octaves. Any note is consonant with the bass,
// so no brick can ever sound "wrong" regardless of hit order.
// F#3 A3  B3  C#4 E4   F#4 A4  B4  C#5 E5  F#5
const SCALE = [
  185.00, 220.00, 246.94, 277.18, 329.63,
  369.99, 440.00, 493.88, 554.37, 659.26, 739.99,
];

// Ring index no longer sets pitch — it shapes timbre, so rings stay
// distinguishable without any of them clashing with the backing.
const RING_CFG = [
  { vol: 0.11, dur: 0.60, cutoff: 3200 },  // 0 melody ring — brightest
  { vol: 0.10, dur: 0.55, cutoff: 2400 },  // 1 outer
  { vol: 0.09, dur: 0.70, cutoff: 1600 },  // 2 middle
  { vol: 0.08, dur: 0.85, cutoff: 1100 },  // 3 inner — darkest
];

// Bass grid — F# minor groove
// F#2=92.50  A2=110.00  G2=98.00  A#2=116.54  E2=82.41  A1=55.00
const BASS_NOTES = [
   92.50,  92.50, 110.00,  98.00,
   92.50,  82.41,  92.50,  55.00,
   92.50, 110.00,  98.00, 110.00,
  116.54, 110.00,  98.00,  92.50,
];

// Bus resting levels (the duck automation needs to know where to return to)
const LVL_BASS = 0.85;
const LVL_PAD  = 0.90;

export class AudioEngine {
  constructor() {
    // One AudioContext for the whole page. GameScene builds a fresh AudioEngine
    // on every scene.restart(), and Safari hard-caps live contexts — creating a
    // new one per restart silently kills audio after a few game-overs.
    if (!AudioEngine._sharedCtx) {
      AudioEngine._sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    this._ctx = AudioEngine._sharedCtx;

    // Detach the previous instance's master chain from the output.
    if (AudioEngine._activeOut) {
      try { AudioEngine._activeOut.disconnect(); } catch (e) { /* already gone */ }
    }

    this._bpm          = 112;
    this._step         = 0;
    this._nextStepAt   = 0;
    this._clockTimer   = null;
    this._melodyCursor = 0;      // read by GameScene HUD arc + Trail tint
    this._scaleIdx     = 5;      // walk position within SCALE
    this._stemLevel    = 0;
    this._mirror       = false;
    this._pad          = null;
    this._noiseBuf     = null;
    this._lfos         = [];
    this._leadVoices   = 0;
    this._lastWallAt   = 0;
    this._lastLeadAt   = 0;

    this._buildMaster();

    this._seq = {
      kick:  this._makeSeq([0, 8]),
      snare: this._makeSeq([]),
      hihat: this._makeSeq([2, 6, 10, 14]),
      ohat:  this._makeSeq([]),
      bass:  this._makeSeq([]),
    };
  }

  // ── Master chain ───────────────────────────────────────────────────────────

  _buildMaster() {
    const ctx = this._ctx;

    // Brickwall-ish limiter: makes clipping structurally impossible no matter
    // how many voices land on the same step.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;      // catches true peaks only; typical play
    limiter.knee.value      = 0;       // passes underneath untouched
    limiter.ratio.value     = 20;
    limiter.attack.value    = 0.003;
    limiter.release.value   = 0.15;
    limiter.connect(ctx.destination);

    // Tames the brittle digital top end.
    const masterLP = ctx.createBiquadFilter();
    masterLP.type            = 'lowpass';
    masterLP.frequency.value = 14000;
    masterLP.Q.value         = 0.7;
    masterLP.connect(limiter);

    // 0.58 keeps the worst realistic pile-up (kick + snare + hat + bass + lead
    // + wall + stab + pad, all landing together) just under full scale, so the
    // limiter only shaves transients instead of squashing the whole mix.
    const master = ctx.createGain();
    master.gain.value = 0.58;
    master.connect(masterLP);

    // ── Reverb: procedurally generated IR, no asset files ──
    const convolver = ctx.createConvolver();
    convolver.buffer = this._makeIR(1.8, 2.5);

    // Damping before the convolver keeps the tail from hissing.
    const revLP = ctx.createBiquadFilter();
    revLP.type            = 'lowpass';
    revLP.frequency.value = 3500;
    revLP.connect(convolver);

    const revReturn = ctx.createGain();
    revReturn.gain.value = 0.90;
    convolver.connect(revReturn);
    revReturn.connect(master);

    const revIn = ctx.createGain();
    revIn.gain.value = 1.0;
    revIn.connect(revLP);

    // ── Buses ──
    const busDrum = ctx.createGain();
    busDrum.gain.value = 1.0;
    busDrum.connect(master);

    // Bass gets its own filter for the slow LFO sweep.
    const bassLP = ctx.createBiquadFilter();
    bassLP.type            = 'lowpass';
    bassLP.frequency.value = 520;
    bassLP.Q.value         = 1.4;
    bassLP.connect(master);

    const busBass = ctx.createGain();
    busBass.gain.value = LVL_BASS;
    busBass.connect(bassLP);

    const busLead = ctx.createGain();
    busLead.gain.value = 1.0;
    busLead.connect(master);

    const padLP = ctx.createBiquadFilter();
    padLP.type            = 'lowpass';
    padLP.frequency.value = 900;
    padLP.Q.value         = 0.8;
    padLP.connect(master);

    const busPad = ctx.createGain();
    busPad.gain.value = LVL_PAD;
    busPad.connect(padLP);

    // Reverb sends. Low end is deliberately never sent — it turns to mud.
    const sendLead = ctx.createGain();
    sendLead.gain.value = 0.30;
    busLead.connect(sendLead);
    sendLead.connect(revIn);

    const sendPad = ctx.createGain();
    sendPad.gain.value = 0.35;
    busPad.connect(sendPad);
    sendPad.connect(revIn);

    this._master  = master;
    this._limiter = limiter;
    this._revIn   = revIn;
    this._busDrum = busDrum;
    this._busBass = busBass;
    this._busLead = busLead;
    this._busPad  = busPad;
    this._bassLP  = bassLP;
    this._padLP   = padLP;

    AudioEngine._activeOut = limiter;
  }

  _makeIR(seconds, decay) {
    const ctx  = this._ctx;
    const rate = ctx.sampleRate;
    const len  = Math.floor(rate * seconds);
    const buf  = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Shared envelope — the attack ramp is what removes the clicks.
  // exponentialRamp cannot touch exact zero, hence the 0.0001 floor.
  _env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak,   t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _makeSeq(seeds) {
    return Array.from({ length: 16 }, (_, i) => seeds.includes(i));
  }

  get _stepLen() { return 60 / this._bpm / 4; }

  unlock() {
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  startAmbient() {
    if (this._clockTimer) return;
    const ctx = this._ctx;
    this._nextStepAt = ctx.currentTime + 0.1;
    this._tick();
    this._startPad();
    this._startLFOs();
  }

  // Four detuned layers instead of one bare sine.
  _startPad() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const layers = [
      { freq:  92.50, type: 'sine',     vol: 0.030, detune:   0 },  // F#2 foundation
      { freq: 185.00, type: 'triangle', vol: 0.022, detune:  -4 },  // F#3 body
      { freq: 277.18, type: 'sine',     vol: 0.014, detune:  +6 },  // C#4 fifth
      { freq: 220.00, type: 'sine',     vol: 0.010, detune:  +2 },  // A3  minor third
    ];

    const voices = layers.map(l => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = l.type;
      osc.frequency.value = l.freq;
      osc.detune.value    = l.detune;
      osc.connect(gain);
      gain.connect(this._busPad);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(l.vol, now + 9);
      osc.start(now);
      return { osc, gain, baseVol: l.vol };
    });

    // Slow detune drift on the fifth gives an ensemble/chorus shimmer.
    const drift     = ctx.createOscillator();
    const driftGain = ctx.createGain();
    drift.type            = 'sine';
    drift.frequency.value = 0.07;
    driftGain.gain.value  = 7;                 // ±7 cents
    drift.connect(driftGain);
    driftGain.connect(voices[2].osc.detune);
    drift.start(now);
    this._lfos.push(drift);

    this._pad = { voices };
  }

  _startLFOs() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // Continuous motion on the bass filter — 300 Hz .. 740 Hz.
    const lfo  = ctx.createOscillator();
    const gain = ctx.createGain();
    lfo.type            = 'sine';
    lfo.frequency.value = 0.06;
    gain.gain.value     = 220;
    lfo.connect(gain);
    gain.connect(this._bassLP.frequency);
    lfo.start(now);
    this._lfos.push(lfo);
  }

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

  // Snap to the nearest 32nd-note boundary — locks hits to the groove while
  // keeping worst-case added latency around 67ms at 112 BPM.
  _quantize(t) {
    if (!this._clockTimer) return t;
    const grid = this._stepLen / 2;
    if (grid <= 0) return t;
    const k = Math.ceil((t - this._nextStepAt) / grid);
    return this._nextStepAt + k * grid;   // always >= t
  }

  // ── Game → sequencer wiring ────────────────────────────────────────────────

  setBPM(bpm) {
    this._bpm = Math.max(95, Math.min(125, Math.round(bpm)));
  }

  activateStep(ringIdx, stepIdx) {
    const map   = ['hihat', 'kick', 'bass', 'ohat'];
    const track = map[ringIdx];
    if (!track) return;
    this._seq[track][stepIdx] = true;
    if (ringIdx === 1 && (stepIdx === 4 || stepIdx === 12)) {
      this._seq.snare[stepIdx] = true;
    }
  }

  // Left unquantized — wall bounces need to feel physically immediate.
  wallHit(side) {
    const now = this._ctx.currentTime;
    if (now - this._lastWallAt < 0.060) return;   // no machine-gunning
    this._lastWallAt = now;

    const t = now + 0.005;
    if (side === 'top')       this._wallTone(t, 554.37, 0.30);  // C#5
    else if (side === 'left') this._wallTone(t, 220.00, 0.38);  // A3
    else                      this._wallTone(t, 329.63, 0.34);  // E4
  }

  // ── Stem unlocks ───────────────────────────────────────────────────────────

  unlockStem(level) {
    if (level <= this._stemLevel) return;
    this._stemLevel = level;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // Pad opens up as the player progresses — audible growth.
    if (level === 1) {
      this._padLP.frequency.linearRampToValueAtTime(1400, now + 3);
    } else if (level === 2) {
      this._seq.snare[4]  = true;
      this._seq.snare[12] = true;
    } else if (level === 3) {
      this._padLP.frequency.linearRampToValueAtTime(2200, now + 3);
    }
  }

  startMirror() {
    this._mirror = true;
    for (let i = 0; i < 16; i++) this._seq.hihat[i] = true;
    this._padLP.frequency.linearRampToValueAtTime(3200, this._ctx.currentTime + 1.0);
  }

  endMirror() {
    this._mirror = false;
  }

  stop() {
    if (this._clockTimer) { clearTimeout(this._clockTimer); this._clockTimer = null; }
    const ctx = this._ctx;
    const now = ctx.currentTime;

    if (this._pad) {
      for (const v of this._pad.voices) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
        v.osc.stop(now + 1.3);
      }
      this._pad = null;
    }

    // Persistent LFO/drift oscillators would otherwise leak one per restart.
    for (const lfo of this._lfos) {
      try { lfo.stop(now + 1.3); } catch (e) { /* already stopped */ }
    }
    this._lfos = [];

    this._step         = 0;
    this._melodyCursor = 0;
    this._scaleIdx     = 5;
    this._stemLevel    = 0;
    this._mirror       = false;
    this._leadVoices   = 0;
    this._seq = {
      kick:  this._makeSeq([0, 8]),
      snare: this._makeSeq([]),
      hihat: this._makeSeq([2, 6, 10, 14]),
      ohat:  this._makeSeq([]),
      bass:  this._makeSeq([]),
    };
  }

  // ── Per-event sounds ───────────────────────────────────────────────────────

  // Weighted random walk through the scale — pure random sounds aimless,
  // a walk reads as melodic movement.
  _nextScaleNote() {
    const steps = [-2, -1, -1, 1, 1, 2];
    let next = this._scaleIdx + steps[Math.floor(Math.random() * steps.length)];
    if (next < 0 || next > SCALE.length - 1) {
      next = this._scaleIdx - Math.sign(next - this._scaleIdx);  // reflect inward
    }
    this._scaleIdx = Math.max(0, Math.min(SCALE.length - 1, next));
    return SCALE[this._scaleIdx];
  }

  brickNote(waveType = 'triangle', ringIdx = 1) {
    const ctx = this._get();
    const now = ctx.currentTime;

    // Cursor advances on every hit even when the note is throttled, so the HUD
    // arc and trail tint stay locked to gameplay.
    this._melodyCursor++;

    if (now - this._lastLeadAt < 0.045) return;
    if (this._leadVoices > 6) return;
    this._lastLeadAt = now;

    this._leadNote(this._quantize(now + 0.005), this._nextScaleNote(), ringIdx);
  }

  paddleTick() {
    this._kick(this._ctx.currentTime + 0.005);
  }

  chordStab() {
    const ctx = this._get();
    const now = ctx.currentTime;
    [369.99, 440.00, 554.37].forEach((f, i) => {     // F#4 A4 C#5
      this._tone(f, 'triangle', 0.045, now + i * 0.012, 0.38);
    });
  }

  corePing() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'triangle', 0.13, now, 2.0);
    this._tone(369.99, 'sine',     0.05, now, 1.2);
  }

  missTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'sine', 0.09, now,        0.30);
    this._tone(138.59, 'sine', 0.05, now + 0.18, 0.45);   // C#3
  }

  clearArpeggio() {
    const ctx = this._get();
    [185.00, 220.00, 277.18, 369.99, 440.00].forEach((f, i) => {
      this._tone(f, 'triangle', 0.11, ctx.currentTime + i * 0.10, 0.8);
    });
  }

  gameOverTone() {
    const ctx = this._get();
    const now = ctx.currentTime;
    this._tone(185.00, 'sine', 0.12, now,       2.8);
    this._tone(138.59, 'sine', 0.06, now + 0.2, 2.2);
  }

  setArpTempo() {}  // legacy stub

  // ── Synthesis ──────────────────────────────────────────────────────────────

  // Bottoms at 45Hz, not 28Hz — below ~150Hz a phone speaker reproduces nothing,
  // so sub-40Hz content was pure headroom waste. The 400Hz transient keeps the
  // kick legible on small speakers.
  _kick(t) {
    const ctx = this._ctx;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this._busDrum);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    this._env(gain.gain, t, 0.38, 0.004, 0.24);
    osc.start(t);
    osc.stop(t + 0.30);

    const click = ctx.createOscillator();
    const cg    = ctx.createGain();
    click.connect(cg);
    cg.connect(this._busDrum);
    click.type            = 'sine';
    click.frequency.value = 400;
    this._env(cg.gain, t, 0.07, 0.001, 0.020);
    click.start(t);
    click.stop(t + 0.04);

    this._duck(t);
  }

  // Classic sidechain pump — the motion that lets a bass-heavy mix breathe.
  _duck(t) {
    const b = this._busBass.gain;
    b.cancelScheduledValues(t);
    b.setValueAtTime(LVL_BASS * 0.25, t);
    b.linearRampToValueAtTime(LVL_BASS, t + 0.18);

    const p = this._busPad.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(LVL_PAD * 0.60, t);
    p.linearRampToValueAtTime(LVL_PAD, t + 0.22);
  }

  _snare(t) {
    const ctx = this._ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this._getNoise();
    const filt = ctx.createBiquadFilter();
    filt.type            = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value         = 0.85;
    const ng = ctx.createGain();
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(this._busDrum);

    // A touch of reverb gives the snare body without muddying the low end.
    const send = ctx.createGain();
    send.gain.value = 0.12;
    ng.connect(send);
    send.connect(this._revIn);

    this._env(ng.gain, t, 0.16, 0.002, 0.13);
    noise.start(t, Math.random() * 0.5);
    noise.stop(t + 0.18);

    const osc = ctx.createOscillator();
    const og  = ctx.createGain();
    osc.connect(og);
    og.connect(this._busDrum);
    osc.type            = 'triangle';
    osc.frequency.value = 160;
    this._env(og.gain, t, 0.09, 0.002, 0.06);
    osc.start(t);
    osc.stop(t + 0.10);
  }

  // 6.5kHz highpass + 12kHz lowpass: keeps the tick, drops the fizz that phone
  // speakers exaggerate.
  _hihat(t, open = false) {
    const ctx   = this._ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this._getNoise();

    const hp = ctx.createBiquadFilter();
    hp.type            = 'highpass';
    hp.frequency.value = 6500;

    const lp = ctx.createBiquadFilter();
    lp.type            = 'lowpass';
    lp.frequency.value = 12000;

    const gain = ctx.createGain();
    noise.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(this._busDrum);

    const dur = open ? 0.10 : 0.028;
    this._env(gain.gain, t, 0.075, 0.001, dur);
    noise.start(t, Math.random() * 0.5);
    noise.stop(t + dur + 0.02);
  }

  _wallTone(t, freq, dur) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this._busLead);
    osc.type            = 'sine';
    osc.frequency.value = freq;
    this._env(gain.gain, t, 0.07, 0.006, dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Two detuned oscillators through a closing filter — a plucked character that
  // sits in the mix rather than a bare triangle.
  _leadNote(t, freq, ringIdx) {
    const ctx = this._ctx;
    const cfg = RING_CFG[ringIdx] ?? RING_CFG[1];

    const filt = ctx.createBiquadFilter();
    filt.type    = 'lowpass';
    filt.Q.value = 1.2;
    filt.frequency.setValueAtTime(cfg.cutoff, t);
    filt.frequency.exponentialRampToValueAtTime(
      Math.max(cfg.cutoff * 0.25, 220), t + cfg.dur,
    );

    const gain = ctx.createGain();
    filt.connect(gain);
    gain.connect(this._busLead);

    const oscA = ctx.createOscillator();
    oscA.type            = 'triangle';
    oscA.frequency.value = freq;
    oscA.detune.value    = -5;
    oscA.connect(filt);

    const oscB = ctx.createOscillator();
    oscB.type            = 'sine';
    oscB.frequency.value = freq;
    oscB.detune.value    = +5;
    oscB.connect(filt);

    this._env(gain.gain, t, cfg.vol, 0.012, cfg.dur);

    const end = t + 0.012 + cfg.dur + 0.05;
    oscA.start(t); oscA.stop(end);
    oscB.start(t); oscB.stop(end);

    this._leadVoices++;
    oscA.onended = () => { this._leadVoices = Math.max(0, this._leadVoices - 1); };
  }

  // Sub-octave floors at 55Hz and is skipped for already-low notes.
  _bassNote(t, freq, dur) {
    const ctx = this._ctx;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this._busBass);
    osc.type            = 'triangle';
    osc.frequency.value = freq;
    this._env(gain.gain, t, 0.16, 0.008, dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    if (freq >= 80) {
      const sub  = ctx.createOscillator();
      const subg = ctx.createGain();
      sub.connect(subg);
      subg.connect(this._busBass);
      sub.type            = 'sine';
      sub.frequency.value = Math.max(freq / 2, 55);
      this._env(subg.gain, t, 0.11, 0.010, dur * 0.75);
      sub.start(t);
      sub.stop(t + dur + 0.05);
    }
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

  _tone(freq, type, vol, t, dur, attack = 0.012) {
    const ctx  = this._ctx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this._busLead);
    osc.type            = type;
    osc.frequency.value = freq;
    this._env(gain.gain, t, vol, attack, dur);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
  }
}

AudioEngine._sharedCtx = null;
AudioEngine._activeOut = null;
