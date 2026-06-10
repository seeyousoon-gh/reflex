import { Cfg } from '../config.js';

const LAYERS    = 9;
const K         = 0.80;    // scale factor per layer (geometric depth)
const MAX_SHIFT = 52;      // max gyro parallax in px
const SMOOTH    = 0.05;    // gyro lerp per frame

export class InfinityMirror {
  constructor(scene) {
    this.W    = scene.scale.width;
    this.H    = scene.scale.height;
    this._gfx = scene.add.graphics().setDepth(-1);
    this._gx  = 0;   // smoothed left/right tilt
    this._gy  = 0;   // smoothed forward/back tilt
    this._setupGyro();
    scene.events.once('shutdown', () => this._destroy());
  }

  _setupGyro() {
    // gamma = left/right (-90→90), beta = front/back (-180→180)
    // On a portrait phone beta ≈ 75° at rest — normalise around that.
    this._handler = ({ gamma, beta }) => {
      const tx = Phaser.Math.Clamp((gamma || 0) / 30, -1, 1);
      const ty = Phaser.Math.Clamp(((beta  || 75) - 75) / 30, -1, 1);
      this._gx += (tx - this._gx) * SMOOTH;
      this._gy += (ty - this._gy) * SMOOTH;
    };

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      this._needsPerm = true;
    } else {
      window.addEventListener('deviceorientation', this._handler, true);
    }
  }

  // Call from a user-gesture handler (pointerdown) — iOS only
  requestPermission() {
    if (!this._needsPerm) return;
    DeviceOrientationEvent.requestPermission()
      .then(s => {
        if (s === 'granted') {
          window.addEventListener('deviceorientation', this._handler, true);
          this._needsPerm = false;
        }
      })
      .catch(() => {});
  }

  update() {
    const gfx = this._gfx;
    gfx.clear();

    const W  = this.W;
    const H  = this.H;

    // Vanishing point shifts with gyro
    const vx = W / 2 + this._gx * MAX_SHIFT;
    const vy = H / 2 + this._gy * MAX_SHIFT;

    // Pre-compute layer geometry
    // i=0 = outermost (scale 1.0), i=N-1 = innermost (scale K^8 ≈ 0.17)
    const layers = Array.from({ length: LAYERS }, (_, i) => {
      const s = Math.pow(K, i);
      return {
        cx:  W / 2 + (vx - W / 2) * (1 - s),
        cy:  H / 2 + (vy - H / 2) * (1 - s),
        hw:  (W / 2 - 5) * s,
        hh:  (H / 2 - 5) * s,
        t:   1 - i / (LAYERS - 1),          // 1=outermost, 0=innermost
        col: i % 2 === 0 ? Cfg.primaryGold : Cfg.teal,
      };
    });

    // Draw back-to-front (innermost first so outer layers occlude)
    for (let i = LAYERS - 1; i >= 0; i--) {
      const { cx, cy, hw, hh, t, col } = layers[i];
      const alpha = 0.05 + t * 0.22;

      // ── Tunnel-wall lines to the next outer layer ──────────────────────
      if (i > 0) {
        const o = layers[i - 1];
        gfx.lineStyle(0.7, col, alpha * 0.40);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
          gfx.beginPath();
          gfx.moveTo(cx    + sx * hw,    cy    + sy * hh);
          gfx.lineTo(o.cx  + sx * o.hw,  o.cy  + sy * o.hh);
          gfx.strokePath();
        });
      }

      // ── Rectangle frame ────────────────────────────────────────────────
      gfx.lineStyle(t > 0.5 ? 1.1 : 0.7, col, alpha);
      gfx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2);

      // ── Corner L-ticks ─────────────────────────────────────────────────
      const tick = Math.min(hw, hh) * 0.13;
      gfx.lineStyle(0.9, col, alpha * 1.5);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        const ex = cx + sx * hw;
        const ey = cy + sy * hh;
        gfx.beginPath();
        gfx.moveTo(ex - sx * tick, ey);
        gfx.lineTo(ex, ey);
        gfx.lineTo(ex, ey - sy * tick);
        gfx.strokePath();
      });

      // ── Circle ring + spokes every 3rd layer (mandala echo) ───────────
      if (i % 3 === 0) {
        const cr = Math.min(hw, hh) * 0.72;
        gfx.lineStyle(0.7, col, alpha * 0.9);
        gfx.strokeCircle(cx, cy, cr);
        for (let j = 0; j < 6; j++) {
          const a = (Math.PI / 3) * j;
          gfx.lineStyle(0.5, col, alpha * 0.45);
          gfx.beginPath();
          gfx.moveTo(cx + Math.cos(a) * cr * 0.28, cy + Math.sin(a) * cr * 0.28);
          gfx.lineTo(cx + Math.cos(a) * cr,        cy + Math.sin(a) * cr);
          gfx.strokePath();
        }
      }
    }
  }

  _destroy() {
    window.removeEventListener('deviceorientation', this._handler, true);
    this._gfx.destroy();
  }
}
