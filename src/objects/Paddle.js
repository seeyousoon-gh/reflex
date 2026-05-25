import { Cfg } from '../config.js';

const MB = () => Phaser.Physics.Matter.Matter.Body;

export class Paddle {
  constructor(scene, x, y) {
    this.scene  = scene;
    this._x     = x;
    this._y     = y;

    this.body = scene.matter.add.rectangle(x, y, Cfg.paddleWidth, Cfg.paddleHeight, {
      isStatic:    true,
      restitution: 1.0,
      friction:    0,
      frictionAir: 0,
      label:       'paddle',
    });

    this.gfx = scene.add.graphics().setDepth(5);
    this._draw(x, y);
  }

  get x() { return this.body.position.x; }

  // Move paddle centre to x, clamped to screen width
  moveTo(x, screenW) {
    const half    = Cfg.paddleWidth / 2;
    const clamped = Phaser.Math.Clamp(x, half, screenW - half);
    MB().setPosition(this.body, { x: clamped, y: this._y });
    this._draw(clamped, this._y);
  }

  _draw(x, y) {
    const w = Cfg.paddleWidth, h = Cfg.paddleHeight, r = h / 2;
    this.gfx.clear();
    // Fill
    this.gfx.fillStyle(Cfg.ivory, 0.9);
    this.gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
    // Stroke — gold rim
    this.gfx.lineStyle(1.5, Cfg.primaryGold, 1.0);
    this.gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
  }
}
