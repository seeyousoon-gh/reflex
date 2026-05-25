import { Cfg } from '../config.js';

const MB = () => Phaser.Physics.Matter.Matter.Body;

export class Ball {
  constructor(scene, x, y) {
    this.scene = scene;
    this.launched = false;

    // Sensor body — Matter.js detects overlaps and fires collisionstart,
    // but applies zero impulse. All velocity changes are manual so there
    // is nothing for the engine to fight.
    this.body = scene.matter.add.circle(x, y, Cfg.ballRadius, {
      isSensor:       true,
      frictionAir:    0,
      inertia:        Infinity,
      inverseInertia: 0,
      label:          'ball',
    });

    // Visual — simple white circle drawn once, repositioned every frame
    this.gfx = scene.add.graphics().setDepth(6);
    this.gfx.fillStyle(0xFFFFFF, 1);
    this.gfx.fillCircle(0, 0, Cfg.ballRadius);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  // Call once per frame to keep graphic in sync with physics body
  sync() {
    this.gfx.setPosition(this.body.position.x, this.body.position.y);
  }

  launch(vx, vy) {
    this.launched = true;
    MB().setVelocity(this.body, { x: vx, y: vy });
  }

  setPosition(x, y) {
    MB().setPosition(this.body, { x, y });
  }

  setVelocity(x, y) {
    MB().setVelocity(this.body, { x, y });
  }

  reset(x, y) {
    this.launched = false;
    MB().setVelocity(this.body, { x: 0, y: 0 });
    MB().setPosition(this.body, { x, y });
  }

  // Clamp speed to target (px/frame). Matter.js drifts over time.
  normalizeSpeed(targetPPF) {
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed < 0.01) return;
    if (Math.abs(speed - targetPPF) / targetPPF > 0.04) {
      const s = targetPPF / speed;
      MB().setVelocity(this.body, { x: v.x * s, y: v.y * s });
    }
  }

  // Rotate velocity by a small random angle to break looping patterns
  jitter(maxDeg) {
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed < 0.01) return;
    const a = (Math.random() * 2 - 1) * maxDeg * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    MB().setVelocity(this.body, {
      x: v.x * c - v.y * s,
      y: v.x * s + v.y * c,
    });
  }
}
