import { Cfg } from '../config.js';

const MAX = 22;

export class Trail {
  constructor(scene, ball) {
    this.scene = scene;
    this.ball  = ball;
    this.gfx   = scene.add.graphics().setDepth(5);
    this._pos  = [];
  }

  update() {
    const gfx = this.gfx;
    gfx.clear();

    if (!this.ball.launched) { this._pos.length = 0; return; }

    this._pos.push({ x: this.ball.x, y: this.ball.y });
    if (this._pos.length > MAX) this._pos.shift();

    // Tint pulses teal→gold→teal over the 16-note phrase
    const cursor = this.scene.audio ? (this.scene.audio._melodyCursor % 16) : 0;
    const t      = (1 - Math.cos(cursor * Math.PI / 8)) / 2;
    const color  = (Math.round(0x4E + (0xC9 - 0x4E) * t) << 16)
                 | (Math.round(0xCD + (0xA8 - 0xCD) * t) << 8)
                 |  Math.round(0xC4 + (0x4C - 0xC4) * t);

    const n = this._pos.length;
    for (let i = 0; i < n; i++) {
      const a = (i + 1) / n;
      gfx.fillStyle(color, a * a * 0.52);
      gfx.fillCircle(this._pos[i].x, this._pos[i].y, Cfg.ballRadius * (0.15 + a * 0.62));
    }
  }
}
