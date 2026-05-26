import { Cfg } from '../config.js';

// D major scale: D E F# G A B C# — three octaves (low→high, inner→outer)
const D_MAJOR = [
  [146.83, 164.81, 185.00, 196.00, 220.00, 246.94, 277.18],  // octave 3 (inner)
  [293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 554.37],  // octave 4 (middle)
  [587.33, 659.25, 739.99, 783.99, 880.00, 987.77, 1108.73], // octave 5 (outer)
];

// Gymnopédie No. 1 opening phrase — 16 notes, upper register for outermost ring
//  E5    D5    E5    B4    A4    A4    D5    C#5
//  B4    A4    G4    F#4   E4    D4    E4    F#4
const GYMNOPEDIE_MELODY = [
  659.25, 587.33, 659.25, 493.88, 440.00, 440.00, 587.33, 554.37,
  493.88, 440.00, 392.00, 369.99, 329.63, 293.66, 329.63, 369.99,
];

export class Bricks {
  constructor(scene) {
    this.scene     = scene;
    this.W         = scene.scale.width;
    this.H         = scene.scale.height;
    this.cx        = this.W / 2;
    this.cy        = this.H * 0.36;
    this.refR      = this.W * 0.46;
    this.remaining = 0;
    this._build();
  }

  _build() {
    this._melodyRing();
    this._ring(Cfg.outerCount,  Cfg.outerRadFrac,  6, Cfg.teal,        0, 'sine');
    this._ring(Cfg.middleCount, Cfg.middleRadFrac,  8, Cfg.primaryGold, 1, 'triangle');
    this._ring(Cfg.innerCount,  Cfg.innerRadFrac,   5, Cfg.silver,      2, 'sine');
    this._core();
  }

  // Outermost ring: 16 bricks carrying the Gymnopédie opening melody in order.
  _melodyRing() {
    const count  = Cfg.melodyCount;
    const radius = this.refR * Cfg.melodyRadFrac;
    const arc    = (2 * Math.PI * radius) / count;
    const bW     = arc * 0.68;
    const bH     = Math.min(radius * 0.13, 11);

    for (let i = 0; i < count; i++) {
      const a  = (2 * Math.PI * i) / count - Math.PI / 2;
      const bx = this.cx + radius * Math.cos(a);
      const by = this.cy + radius * Math.sin(a);
      const ba = a + Math.PI / 2;

      const body = this.scene.matter.add.rectangle(bx, by, bW, bH, {
        isStatic: true, angle: ba, label: 'brick',
        friction: 0, frictionStatic: 0,
      });

      const gfx = this.scene.add.graphics().setDepth(3);
      this._drawPoly(gfx, bx, by, bW * 0.88, bH * 0.88, ba, 4, Cfg.ivory);
      body.gameObject = gfx;
      body._ringIndex = 0;                        // melody-ring slot in AudioEngine
      body._freq      = GYMNOPEDIE_MELODY[i];
      body._waveType  = 'sine';
      this.remaining++;
    }
  }

  _ring(count, radFrac, sides, color, ringIdx, waveType) {
    const radius = this.refR * radFrac;
    const arc    = (2 * Math.PI * radius) / count;
    const bW     = arc * 0.72;
    const bH     = Math.min(radius * 0.16, 13);
    // ringIdx 0=outer→octave5, 1=middle→octave4, 2=inner→octave3
    const octave = D_MAJOR[2 - ringIdx];

    for (let i = 0; i < count; i++) {
      const a  = (2 * Math.PI * i) / count - Math.PI / 2;
      const bx = this.cx + radius * Math.cos(a);
      const by = this.cy + radius * Math.sin(a);
      const ba = a + Math.PI / 2;

      const body = this.scene.matter.add.rectangle(bx, by, bW, bH, {
        isStatic: true, angle: ba, label: 'brick',
        friction: 0, frictionStatic: 0,
      });

      const gfx = this.scene.add.graphics().setDepth(3);
      this._drawPoly(gfx, bx, by, bW * 0.88, bH * 0.88, ba, sides, color);
      body.gameObject = gfx;
      body._ringIndex = ringIdx + 1;  // shift: outer=1, middle=2, inner=3
      body._freq      = octave[i % 7];
      body._waveType  = waveType;
      this.remaining++;
    }
  }

  _core() {
    const r    = 12;
    const body = this.scene.matter.add.circle(this.cx, this.cy, r, {
      isStatic: true,
      label:    'brick',
    });
    const gfx = this.scene.add.graphics().setDepth(3);
    this._drawCore(gfx);
    body.gameObject      = gfx;
    body._indestructible = true;
  }

  // Stretched N-gon fills the bW × bH rectangle, rotated to match physics body.
  _drawPoly(gfx, cx, cy, w, h, rotation, sides, color) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    gfx.fillStyle(color, 0.80);
    gfx.lineStyle(1.2, 0xFFFFFF, 0.45);
    gfx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a  = (2 * Math.PI * i) / sides;
      const lx = (w / 2) * Math.cos(a);
      const ly = (h / 2) * Math.sin(a);
      const rx = cx + lx * c - ly * s;
      const ry = cy + lx * s + ly * c;
      i === 0 ? gfx.moveTo(rx, ry) : gfx.lineTo(rx, ry);
    }
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();
  }

  _drawCore(gfx) {
    const cx = this.cx, cy = this.cy, r = 12;
    gfx.fillStyle(Cfg.primaryGold, 1.0);
    gfx.fillCircle(cx, cy, r);
    gfx.lineStyle(1.5, Cfg.ivory, 0.9);
    gfx.strokeCircle(cx, cy, r);
    gfx.lineStyle(1, Cfg.ivory, 0.40);
    gfx.strokeCircle(cx, cy, r * 0.55);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      gfx.beginPath();
      gfx.moveTo(cx + Math.cos(a) * r * 0.30, cy + Math.sin(a) * r * 0.30);
      gfx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
      gfx.strokePath();
    }
  }
}
