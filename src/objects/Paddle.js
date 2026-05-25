import { Cfg } from '../config.js';

export class Paddle {
  constructor(scene, x, y) {
    this.scene = scene;
    this._x    = x;
    this._y    = y;

    this.gfx = scene.add.graphics().setDepth(5);
    this._draw(x, y);
  }

  get x() { return this._x; }
  get y() { return this._y; }

  moveTo(x, screenW) {
    const half    = Cfg.paddleWidth / 2;
    const clamped = Phaser.Math.Clamp(x, half, screenW - half);
    this._x = clamped;
    this._draw(clamped, this._y);
  }

  _draw(x, y) {
    const w = Cfg.paddleWidth, h = Cfg.paddleHeight, r = h / 2;
    this.gfx.clear();
    this.gfx.fillStyle(Cfg.ivory, 0.9);
    this.gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    this.gfx.lineStyle(1.5, Cfg.primaryGold, 1.0);
    this.gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
  }
}
