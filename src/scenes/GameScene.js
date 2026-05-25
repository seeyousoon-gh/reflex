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

    // Game state
    this.resonance  = 3;
    this.combo      = 0;
    this.score      = 0;
    this.targetPPS  = Cfg.speedAwakening;   // current speed in px/second

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
    const T = 60;   // wall thickness (extends off-screen)
    const o = { isStatic: true, restitution: 1, friction: 0, frictionAir: 0, label: 'wall' };

    this.matter.add.rectangle(W / 2,      -T / 2,    W,  T, o);   // top
    this.matter.add.rectangle(-T / 2,     H / 2,     T,  H, o);   // left
    this.matter.add.rectangle(W + T / 2,  H / 2,     T,  H, o);   // right
    // No bottom wall — miss handled in update()
  }

  _buildPaddle() {
    const { W, H } = this;
    this.paddleY  = H * Cfg.paddleYFrac;
    this.paddle   = new Paddle(this, W / 2, this.paddleY);
  }

  _buildBall() {
    this.ballRestY = this.paddleY
                   - Cfg.paddleHeight / 2
                   - Cfg.ballRadius - 4;
    this.ball = new Ball(this, this.W / 2, this.ballRestY);
  }

  _buildHintText() {
    this.hintText = this.add.text(
      this.W / 2, this.ballRestY - 40,
      'tap to launch',
      { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#C9A84C', alpha: 0.6 }
    ).setOrigin(0.5).setDepth(8).setAlpha(0.6);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Input
  // ─────────────────────────────────────────────────────────────────────────
  _setupInput() {
    let lastX = this.W / 2;

    this.input.on('pointerdown', (p) => {
      lastX = p.x;
      if (!this.ball.launched) {
        this._launchBall();
      }
    });

    this.input.on('pointermove', (p) => {
      if (!p.isDown) return;
      const dx = p.x - lastX;
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

    // Random angle between 50° and 130° from positive-x axis
    const angleDeg = Phaser.Math.Between(50, 130);
    const angleRad = Phaser.Math.DegToRad(angleDeg);
    const spd      = this.targetPPS / 60;          // px/second → px/frame

    // Phaser y-axis goes downward, so upward = negative y
    this.ball.launch(
      Math.cos(angleRad) * spd,
      -Math.sin(angleRad) * spd
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Collisions
  // ─────────────────────────────────────────────────────────────────────────
  _setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const la = pair.bodyA.label;
        const lb = pair.bodyB.label;

        if ((la === 'ball' || lb === 'ball') && (la === 'wall' || lb === 'wall')) {
          this.ball.jitter(1);

        } else if ((la === 'ball' || lb === 'ball') && (la === 'paddle' || lb === 'paddle')) {
          this._onPaddleBounce();

        } else if ((la === 'ball' || lb === 'ball') && (la === 'brick' || lb === 'brick')) {
          const brickBody = la === 'brick' ? pair.bodyA : pair.bodyB;
          this._onBrickHit(brickBody);
        }
      }
    });
  }

  _onPaddleBounce() {
    const relX  = (this.ball.x - this.paddle.x) / (Cfg.paddleWidth / 2);
    const bias  = Phaser.Math.Clamp(relX, -1, 1) * 25 * Math.PI / 180;
    const v     = this.ball.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    const angle = Math.atan2(v.y, v.x) + bias;

    // abs(sin) guarantees ball exits paddle moving upward
    MB().setVelocity(this.ball.body, {
      x:  Math.cos(angle) * speed,
      y: -Math.abs(Math.sin(angle)) * speed,
    });
    this.ball.jitter(1.5);
  }

  _onBrickHit(brickBody) {
    // Full brick logic in Layer 2 — for now just remove it
    if (brickBody.gameObject) brickBody.gameObject.destroy();
    this.matter.world.remove(brickBody);
    this.ball.jitter(3);
    this._incrementCombo();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game loop
  // ─────────────────────────────────────────────────────────────────────────
  update() {
    this.ball.sync();   // keep graphic on top of physics body

    if (!this.ball.launched) {
      // Ball rides on paddle before launch
      this.ball.setPosition(this.paddle.x, this.ballRestY);
      return;
    }

    // Miss — ball fell below bottom of screen
    if (this.ball.y > this.H + 60) {
      this._handleMiss();
      return;
    }

    // Normalise speed every frame (Matter.js drifts ~1-2% over time)
    this.ball.normalizeSpeed(this.targetPPS / 60);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game logic
  // ─────────────────────────────────────────────────────────────────────────
  _incrementCombo() {
    this.combo++;
    this.score += 100;
    // Milestone hooks wired in Layer 3
  }

  _handleMiss() {
    this.combo = 0;
    this.resonance--;

    if (this.resonance <= 0) {
      this._gameOver();
      return;
    }

    // Reset ball to rest on paddle
    this.ball.reset(this.paddle.x, this.ballRestY);
    this.hintText.setPosition(this.paddle.x, this.ballRestY - 40).setVisible(true);
  }

  _gameOver() {
    this.ball.reset(this.W / 2, this.ballRestY);

    // Layer 7 will flesh this out with full fade + "Return." text
    this.add.text(this.W / 2, this.H / 2, 'Return.', {
      fontFamily: 'Georgia, serif',
      fontSize:   '36px',
      color:      '#F0ECD8',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets:  this.children.getAll().slice(-1),
      alpha:    1,
      duration: 1500,
      ease:     'Sine.easeIn',
    });

    this.time.delayedCall(3000, () => this.scene.restart());
  }
}
