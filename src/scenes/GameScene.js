import { Cfg }    from '../config.js';
import { Ball }   from '../objects/Ball.js';
import { Paddle } from '../objects/Paddle.js';

const MB = () => Phaser.Physics.Matter.Matter.Body;

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────────────────────────────────
  //  Create
  // ─────────────────────────────────────────────────────────────────────────
  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.resonance = 3;
    this.combo     = 0;
    this.score     = 0;
    this.targetPPS = Cfg.speedAwakening;

    // Rolling paddle velocity — last 4 frames averaged.
    // A rolling window prevents a single fast frame from dominating
    // the swipe-spin angle on contact.
    this._prevPaddleX    = this.W / 2;
    this._paddleVelPPF   = 0;
    this._paddleVelBuf   = [0, 0, 0, 0];

    this._buildBackground();
    this._buildWalls();
    this._buildPaddle();
    this._buildBall();
    this._buildHintText();
    this._setupInput();
    this._setupCollisions();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Scene construction
  // ─────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    this.cameras.main.setBackgroundColor(Cfg.background);
  }

  _buildWalls() {
    // Walls handled manually in _resolveWalls() — no physics bodies needed.
    // Matter.js collisionstart fires before velocity resolution so jitter
    // applied to a pre-collision velocity pointed at the wall causes trapping.
  }

  _buildPaddle() {
    this.paddleY = this.H * Cfg.paddleYFrac;
    this.paddle  = new Paddle(this, this.W / 2, this.paddleY);
  }

  _buildBall() {
    this.ballRestY = this.paddleY - Cfg.paddleHeight / 2 - Cfg.ballRadius - 4;
    this.ball = new Ball(this, this.W / 2, this.ballRestY);
  }

  _buildHintText() {
    this.hintText = this.add.text(
      this.W / 2, this.ballRestY - 40,
      'tap to launch',
      { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#C9A84C' }
    ).setOrigin(0.5).setDepth(8).setAlpha(0.6);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Input — relative delta with sensitivity multiplier
  // ─────────────────────────────────────────────────────────────────────────
  _setupInput() {
    let lastX = 0;

    this.input.on('pointerdown', (p) => {
      lastX = p.x;
      if (!this.ball.launched) this._launchBall();
    });

    this.input.on('pointermove', (p) => {
      if (!p.isDown) return;
      const dx = (p.x - lastX) * Cfg.paddleSensitivity;
      lastX = p.x;
      this.paddle.moveTo(this.paddle.x + dx, this.W);
      if (!this.ball.launched) {
        this.ball.setPosition(this.paddle.x, this.ballRestY);
        this.hintText.setX(this.paddle.x);
      }
    });
  }

  _launchBall() {
    this.hintText.setVisible(false);
    const deg = Phaser.Math.Between(50, 130);
    const rad = Phaser.Math.DegToRad(deg);
    const spd = this.targetPPS / 60;
    this.ball.launch(Math.cos(rad) * spd, -Math.sin(rad) * spd);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Collisions
  // ─────────────────────────────────────────────────────────────────────────
  _setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const la = pair.bodyA.label;
        const lb = pair.bodyB.label;

        if ((la === 'ball' || lb === 'ball') && (la === 'paddle' || lb === 'paddle')) {
          // Use the actual Matter.js contact point(s) for accurate hit position.
          // pair.collision.supports holds world-space contact coordinates — more
          // reliable than ball.x when the paddle is moving at contact time.
          const supports = pair.collision.supports;
          const contactX = supports && supports.length > 0
            ? supports.reduce((s, p) => s + p.x, 0) / supports.length
            : this.ball.x;
          this._onPaddleBounce(contactX);
        }

        if ((la === 'ball' || lb === 'ball') && (la === 'brick' || lb === 'brick')) {
          const brickBody = la === 'brick' ? pair.bodyA : pair.bodyB;
          this._onBrickHit(brickBody);
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Wall reflections — manual, every frame
  // ─────────────────────────────────────────────────────────────────────────
  _resolveWalls() {
    const r   = Cfg.ballRadius;
    const vel = this.ball.body.velocity;
    let vx = vel.x, vy = vel.y;
    let px = this.ball.x, py = this.ball.y;
    let hit = false;

    if (py - r <= 0 && vy < 0)      { vy = Math.abs(vy);  py = r + 1;         hit = true; } // ceiling
    if (px - r <= 0 && vx < 0)      { vx = Math.abs(vx);  px = r + 1;         hit = true; } // left
    if (px + r >= this.W && vx > 0) { vx = -Math.abs(vx); px = this.W - r - 1; hit = true; } // right

    if (hit) {
      MB().setPosition(this.ball.body, { x: px, y: py });
      MB().setVelocity(this.ball.body, { x: vx, y: vy });
      this.ball.jitter(1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Paddle bounce — contact-point hit detection + zone angle + swipe spin
  //
  //  Three distinct cases:
  //
  //  1. TOP FACE hit (ball came from above):
  //     Zone angle maps contact position to output angle:
  //       left edge → 150°, centre → 90°, right edge → 30°
  //     Corner zone (|relX| > 0.85): snap to maximum angle so clipping
  //     the edge always gives a consistent, readable result.
  //     Swipe spin adds ±paddleSwipeMaxDeg based on paddle velocity.
  //
  //  2. SIDE hit (ball centre is level with or below paddle top):
  //     Treat like a wall — flip vx, preserve vy. Ball deflects sideways.
  //     Happens when the paddle slides into a slow-moving ball from the side.
  //
  //  Velocity is always set explicitly — we never rely on Matter.js to
  //  compute the impulse (collisionstart fires pre-resolution anyway).
  // ─────────────────────────────────────────────────────────────────────────
  _onPaddleBounce(contactX) {
    const paddleTopY = this.paddleY - Cfg.paddleHeight / 2;
    const vel        = this.ball.body.velocity;
    const speed      = Math.hypot(vel.x, vel.y) || (this.targetPPS / 60);

    // ── Side hit ─────────────────────────────────────────────────────────
    // Ball centre is at or below the paddle's top face → hit from the side.
    if (this.ball.y >= paddleTopY - Cfg.ballRadius * 0.5) {
      // Deflect away from whichever side of the paddle was hit
      const goingRight = this.ball.x > this.paddle.x;
      MB().setVelocity(this.ball.body, {
        x: goingRight ? Math.abs(vel.x) : -Math.abs(vel.x),
        y: vel.y,
      });
      return;
    }

    // ── Top face hit ─────────────────────────────────────────────────────
    const halfW = Cfg.paddleWidth / 2;
    const relX  = Phaser.Math.Clamp((contactX - this.paddle.x) / halfW, -1, 1);

    // Corner zone: snap relX to ±1 so the angle is deterministic,
    // not somewhere randomly between centre and edge.
    const isCorner    = Math.abs(relX) > 0.85;
    const effectiveRX = isCorner ? Math.sign(relX) : relX;

    // Zone base angle: left=-1 → 150°, centre=0 → 90°, right=+1 → 30°
    const baseDeg = 90 + effectiveRX * Cfg.paddleSteeringRange;

    // Swipe spin from rolling paddle velocity average
    const swipeNorm = Phaser.Math.Clamp(this._paddleVelPPF / Cfg.paddleSwipeNormPPF, -1, 1);
    const swipeDeg  = swipeNorm * Cfg.paddleSwipeMaxDeg;

    const finalDeg = Phaser.Math.Clamp(baseDeg + swipeDeg, 18, 162);
    const finalRad = Phaser.Math.DegToRad(finalDeg);

    MB().setVelocity(this.ball.body, {
      x:  Math.cos(finalRad) * speed,
      y: -Math.sin(finalRad) * speed,   // always upward
    });

    this.ball.jitter(0.5);
  }

  _onBrickHit(brickBody) {
    if (brickBody.gameObject) brickBody.gameObject.destroy();
    this.matter.world.remove(brickBody);
    this.ball.jitter(3);
    this._incrementCombo();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game loop
  // ─────────────────────────────────────────────────────────────────────────
  update() {
    // Rolling paddle velocity average over last 4 frames.
    // Smooths out single-frame spikes so swipe spin reflects
    // sustained movement, not accidental jitter.
    const frameVel = this.paddle.x - this._prevPaddleX;
    this._paddleVelBuf.push(frameVel);
    this._paddleVelBuf.shift();
    this._paddleVelPPF = this._paddleVelBuf.reduce((a, b) => a + b, 0) / this._paddleVelBuf.length;
    this._prevPaddleX  = this.paddle.x;

    this.ball.sync();

    if (!this.ball.launched) {
      this.ball.setPosition(this.paddle.x, this.ballRestY);
      return;
    }

    if (this.ball.y > this.H + 60) {
      this._handleMiss();
      return;
    }

    this._resolveWalls();
    this.ball.normalizeSpeed(this.targetPPS / 60);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game logic
  // ─────────────────────────────────────────────────────────────────────────
  _incrementCombo() {
    this.combo++;
    this.score += 100;
  }

  _handleMiss() {
    this.combo = 0;
    this.resonance--;

    if (this.resonance <= 0) {
      this._gameOver();
      return;
    }

    this.ball.reset(this.paddle.x, this.ballRestY);
    this.hintText.setPosition(this.paddle.x, this.ballRestY - 40).setVisible(true);
  }

  _gameOver() {
    this.ball.reset(this.W / 2, this.ballRestY);

    const txt = this.add.text(this.W / 2, this.H / 2, 'Return.', {
      fontFamily: 'Georgia, serif',
      fontSize:   '36px',
      color:      '#F0ECD8',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({ targets: txt, alpha: 1, duration: 1500, ease: 'Sine.easeIn' });
    this.time.delayedCall(3000, () => this.scene.restart());
  }
}
