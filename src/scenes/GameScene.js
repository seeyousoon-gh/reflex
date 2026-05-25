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

    // Paddle velocity tracking — used for swipe-spin on bounce
    this._prevPaddleX  = this.W / 2;
    this._paddleVelPPF = 0;   // pixels-per-frame

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
    const { W, H } = this;
    const T = 60;
    const o = { isStatic: true, restitution: 1, friction: 0, frictionAir: 0, label: 'wall' };

    this.matter.add.rectangle(W / 2,     -T / 2,   W, T, o);   // top
    this.matter.add.rectangle(-T / 2,     H / 2,   T, H, o);   // left
    this.matter.add.rectangle(W + T / 2,  H / 2,   T, H, o);   // right
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
  //  Input — absolute X tracking
  //  Paddle centre snaps directly to finger X anywhere on screen.
  //  Small finger movements = full paddle travel. No 1:1 drag needed.
  // ─────────────────────────────────────────────────────────────────────────
  _setupInput() {
    this.input.on('pointerdown', (p) => {
      this.paddle.moveTo(p.x, this.W);
      if (!this.ball.launched) {
        this._launchBall();
      }
    });

    this.input.on('pointermove', (p) => {
      if (!p.isDown) return;
      this.paddle.moveTo(p.x, this.W);
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

        if ((la === 'ball' || lb === 'ball') && (la === 'wall'   || lb === 'wall'))   { this.ball.jitter(1); }
        if ((la === 'ball' || lb === 'ball') && (la === 'paddle' || lb === 'paddle')) { this._onPaddleBounce(); }
        if ((la === 'ball' || lb === 'ball') && (la === 'brick'  || lb === 'brick'))  {
          const brickBody = la === 'brick' ? pair.bodyA : pair.bodyB;
          this._onBrickHit(brickBody);
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Paddle bounce — zone angle + swipe spin
  //
  //  Zone angle: hit position maps directly to output angle.
  //    left edge  → 90 + steeringRange  degrees (upper-left)
  //    centre     → 90°                  (straight up)
  //    right edge → 90 - steeringRange  degrees (upper-right)
  //
  //  Swipe spin: paddle velocity at contact adds ±swipeMaxDeg on top.
  //  Moving paddle left while hitting nudges ball further left, and vice versa.
  // ─────────────────────────────────────────────────────────────────────────
  _onPaddleBounce() {
    // Where on the paddle did the ball land? (-1 = far left, +1 = far right)
    const relX = Phaser.Math.Clamp(
      (this.ball.x - this.paddle.x) / (Cfg.paddleWidth / 2), -1, 1
    );

    // Base angle from hit position
    const baseDeg = 90 + relX * Cfg.paddleSteeringRange;

    // Swipe component: how fast is the paddle moving right now?
    const swipeNorm  = Phaser.Math.Clamp(this._paddleVelPPF / Cfg.paddleSwipeNormPPF, -1, 1);
    const swipeDeg   = swipeNorm * Cfg.paddleSwipeMaxDeg;

    // Combine and clamp to a playable range (never nearly horizontal)
    const finalDeg = Phaser.Math.Clamp(baseDeg + swipeDeg, 18, 162);
    const finalRad = Phaser.Math.DegToRad(finalDeg);

    const speed = Math.hypot(this.ball.body.velocity.x, this.ball.body.velocity.y)
                  || (this.targetPPS / 60);

    // cos(angle) → horizontal, -sin(angle) → upward (Phaser y-axis inverted)
    MB().setVelocity(this.ball.body, {
      x:  Math.cos(finalRad) * speed,
      y: -Math.sin(finalRad) * speed,   // always negative = always upward
    });

    // Tiny jitter only — steering is intentional now
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
    // Track paddle velocity (px/frame) for swipe-spin effect
    this._paddleVelPPF = this.paddle.x - this._prevPaddleX;
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
