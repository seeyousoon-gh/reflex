import { Cfg } from '../config.js';

const MAX = 22;

export class Trail {
  constructor(scene, ball) {
    this.ball = ball;
    this.gfx  = scene.add.graphics().setDepth(5);
    this._pos = [];
  }

  update() {
    const gfx = this.gfx;
    gfx.clear();

    if (!this.ball.launched) { this._pos.length = 0; return; }

    this._pos.push({ x: this.ball.x, y: this.ball.y });
    if (this._pos.length > MAX) this._pos.shift();

    const n = this._pos.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;        // 0→1, oldest→newest
      gfx.fillStyle(0xFFFFFF, t * t * 0.52);
      gfx.fillCircle(this._pos[i].x, this._pos[i].y, Cfg.ballRadius * (0.15 + t * 0.62));
    }
  }
}
