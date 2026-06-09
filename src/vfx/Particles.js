export class Particles {
  constructor(scene) {
    this.scene  = scene;
    this._gfx   = scene.add.graphics().setDepth(2);
    this._dots  = [];   // ambient floating dust
    this._burst = [];   // active brick-break fragments
    this._initDots(scene.scale.width, scene.scale.height);
  }

  _initDots(W, H) {
    for (let i = 0; i < 30; i++) {
      this._dots.push({
        x:  Math.random() * W,
        y:  Math.random() * H,
        vy: -(0.12 + Math.random() * 0.35),
        a:  0.03 + Math.random() * 0.09,
        r:  0.6  + Math.random() * 1.2,
        W, H,
      });
    }
  }

  // Call once per frame — updates ambient dots and burst fragments on a single Graphics.
  update() {
    const gfx = this._gfx;
    gfx.clear();

    // Ambient dust drifts upward, wraps at top
    for (const d of this._dots) {
      d.y += d.vy;
      if (d.y < -4) { d.y = d.H + 4; d.x = Math.random() * d.W; }
      gfx.fillStyle(0xFFFFFF, d.a);
      gfx.fillCircle(d.x, d.y, d.r);
    }

    // Burst fragments — velocity + subtle gravity, fade by lifetime
    this._burst = this._burst.filter(p => p.life > 0);
    for (const p of this._burst) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.06;   // light gravity
      p.life--;
      gfx.fillStyle(p.color, p.life / p.maxLife);
      gfx.fillRect(p.x - p.s * 0.5, p.y - p.s * 0.5, p.s, p.s);
    }
  }

  spawnBurst(x, y, color) {
    const COUNT = 8;
    for (let i = 0; i < COUNT; i++) {
      const a     = (2 * Math.PI * i) / COUNT + (Math.random() - 0.5) * 0.8;
      const speed = 1.0 + Math.random() * 2.2;
      const life  = 22 + Math.random() * 14 | 0;
      this._burst.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        s:     2 + Math.random() * 2.5,
        color, life, maxLife: life,
      });
    }
  }
}
