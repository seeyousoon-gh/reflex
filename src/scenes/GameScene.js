import { Cfg }    from '../config.js';
import { Ball }   from '../objects/Ball.js';
import { Paddle } from '../objects/Paddle.js';
import { Bricks } from '../objects/Bricks.js';

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

    this._prevPaddleX  = this.W / 2;
    this._paddleVelPPF = 0;
    this._paddleVelBuf = [0, 0, 0, 0];

    this._buildBackground();
    this._buildWalls();
    this._buildPaddle();
    this._buildBall();
    this._buildBricks();
    this._buildHUD();
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
  }

  _buildPaddle() {
    this.paddleY = this.H * Cfg.paddleYFrac;
    this.paddle  = new Paddle(this, this.W / 2, this.paddleY);
  }

  _buildBall() {
    this.ballRestY = this.paddleY - Cfg.paddleHeight / 2 - Cfg.ballRadius - 4;
    this.ball = new Ball(this, this.W / 2, this.ballRestY);
  }

  _buildBricks() {
    this.bricks = new Bricks(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  HUD — resonance orbs · combo · score
  // ─────────────────────────────────────────────────────────────────────────
  _buildHUD() {
    const y = 28;

    // Three resonance orbs, centred at top
    this._resGfx = this.add.graphics().setDepth(10);
    this._drawResOrbs();

    // Combo (top-left, hidden until combo > 1)
    this._comboTxt = this.add.text(20, y, '', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#C9A84C',
    }).setOrigin(0, 0.5).setDepth(10).setAlpha(0.75);

    // Score (top-right)
    this._scoreTxt = this.add.text(this.W - 20, y, '0', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#F0ECD8',
    }).setOrigin(1, 0.5).setDepth(10).setAlpha(0.45);
  }

  _drawResOrbs() {
    this._resGfx.clear();
    const y = 28;
    for (let i = 0; i < 3; i++) {
      const x     = this.W / 2 + (i - 1) * 18;
      const alive = i < this.resonance;
      this._resGfx.fillStyle(alive ? Cfg.primaryGold : 0x1e1a2e, alive ? 0.9 : 0.5);
      this._resGfx.fillCircle(x, y, 4);
      if (alive) {
        this._resGfx.lineStyle(1, Cfg.ivory, 0.35);
        this._resGfx.strokeCircle(x, y, 4);
      }
    }
  }

  // Brief centred phase-name flash — fades in, holds, fades out.
  _flashPhase(name) {
    const txt = this.add.text(this.W / 2, this.H * 0.54, name, {
      fontFamily: 'Georgia, serif', fontSize: '17px', color: '#C9A84C',
    }).setOrigin(0.5).setDepth(15).setAlpha(0);

    this.tweens.add({
      targets: txt, alpha: 0.8, duration: 300, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({
        targets: txt, alpha: 0, delay: 800, duration: 500, ease: 'Sine.easeIn',
        onComplete: () => txt.destroy(),
      }),
    });
  }

  _updateHUD() {
    this._comboTxt.setText(this.combo > 1 ? `× ${this.combo}` : '');
    this._scoreTxt.setText(`${this.score}`);
  }

  _buildHintText() {
    this.hintText = this.add.text(
      this.W / 2, this.ballRestY - 40,
      'tap to launch',
      { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#C9A84C' }
    ).setOrigin(0.5).setDepth(8).setAlpha(0.6);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Input
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
  //  Collisions — only bricks; paddle is handled manually
  // ─────────────────────────────────────────────────────────────────────────
  _setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const la = pair.bodyA.label;
        const lb = pair.bodyB.label;

        if ((la === 'ball' || lb === 'ball') && (la === 'brick' || lb === 'brick')) {
          const brickBody = la === 'brick' ? pair.bodyA : pair.bodyB;
          this._onBrickHit(brickBody, pair);
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Manual wall reflections
  // ─────────────────────────────────────────────────────────────────────────
  _resolveWalls() {
    const r   = Cfg.ballRadius;
    const vel = this.ball.body.velocity;
    let vx = vel.x, vy = vel.y;
    let px = this.ball.x, py = this.ball.y;
    let hit = false;

    if (py - r <= 0 && vy < 0)      { vy = Math.abs(vy);  py = r + 1;          hit = true; }
    if (px - r <= 0 && vx < 0)      { vx = Math.abs(vx);  px = r + 1;          hit = true; }
    if (px + r >= this.W && vx > 0) { vx = -Math.abs(vx); px = this.W - r - 1; hit = true; }

    if (hit) {
      MB().setPosition(this.ball.body, { x: px, y: py });
      MB().setVelocity(this.ball.body, { x: vx, y: vy });
      this.ball.jitter(1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Manual paddle collision — runs every frame, immune to tunnelling.
  //
  //  Entry face is determined by SAT (shortest penetration axis):
  //    • Top-face: vertical overlap < horizontal overlap → bounce upward
  //    • Side: horizontal overlap smaller → deflect sideways
  //
  //  No Matter.js body on paddle, ball is a sensor → nothing to fight.
  // ─────────────────────────────────────────────────────────────────────────
  _resolvePaddle() {
    if (!this.ball.launched) return;

    const r     = Cfg.ballRadius;
    const halfW = Cfg.paddleWidth  / 2;
    const halfH = Cfg.paddleHeight / 2;
    const px    = this.paddle.x;
    const py    = this.paddleY;
    const bx    = this.ball.x;
    const by    = this.ball.y;
    const vel   = this.ball.body.velocity;

    // AABB reject
    if (bx + r < px - halfW || bx - r > px + halfW) return;
    if (by + r < py - halfH || by - r > py + halfH) return;

    // SAT: penetration depth on each axis — smallest axis = entry face
    const overlapTop   = (by + r) - (py - halfH);   // depth from above
    const overlapLeft  = (bx + r) - (px - halfW);   // depth from left
    const overlapRight = (px + halfW) - (bx - r);   // depth from right
    const minHoriz     = Math.min(overlapLeft, overlapRight);

    if (overlapTop <= minHoriz && vel.y > 0) {
      // Top-face hit — only when ball is moving downward.
      // vel.y > 0 guard prevents re-triggering after bounce while the ball
      // is still geometrically close to the paddle surface.
      MB().setPosition(this.ball.body, { x: bx, y: py - halfH - r - 1 });
      this._applyTopFaceBounce(bx);
    } else if (overlapTop > minHoriz) {
      // Side hit — push out toward whichever side has less penetration
      const minSpeed = (this.targetPPS / 60) * 0.5;
      if (overlapLeft <= overlapRight) {
        MB().setPosition(this.ball.body, { x: px - halfW - r - 1, y: by });
        MB().setVelocity(this.ball.body, { x: -Math.max(Math.abs(vel.x), minSpeed), y: vel.y });
      } else {
        MB().setPosition(this.ball.body, { x: px + halfW + r + 1, y: by });
        MB().setVelocity(this.ball.body, { x:  Math.max(Math.abs(vel.x), minSpeed), y: vel.y });
      }
    }
    // overlapTop <= minHoriz && vel.y <= 0: ball already bounced upward,
    // still in the zone geometrically — do nothing, let it clear.
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Top-face bounce — zone angle + swipe spin (same logic as before)
  // ─────────────────────────────────────────────────────────────────────────
  _applyTopFaceBounce(contactX) {
    const vel   = this.ball.body.velocity;
    const speed = Math.hypot(vel.x, vel.y) || (this.targetPPS / 60);

    const halfW      = Cfg.paddleWidth / 2;
    const relX       = Phaser.Math.Clamp((contactX - this.paddle.x) / halfW, -1, 1);
    const effectiveRX = Math.abs(relX) > 0.85 ? Math.sign(relX) : relX;

    // left=-1 → 150°, centre=0 → 90°, right=+1 → 30°
    const baseDeg   = 90 - effectiveRX * Cfg.paddleSteeringRange;
    // swipe right (positive vel) → nudge angle down toward 30° (rightward)
    const swipeNorm = Phaser.Math.Clamp(this._paddleVelPPF / Cfg.paddleSwipeNormPPF, -1, 1);
    const finalDeg  = Phaser.Math.Clamp(baseDeg - swipeNorm * Cfg.paddleSwipeMaxDeg, 18, 162);
    const finalRad  = Phaser.Math.DegToRad(finalDeg);

    MB().setVelocity(this.ball.body, {
      x:  Math.cos(finalRad) * speed,
      y: -Math.sin(finalRad) * speed,
    });

    this.ball.jitter(0.5);
  }

  _onBrickHit(brickBody, pair) {
    if (brickBody._destroyed) return;

    if (brickBody._indestructible) {
      // Core: reflect ball but never destroy
      this._reflectBall(pair, 1);
      return;
    }

    brickBody._destroyed = true;
    if (brickBody.gameObject) brickBody.gameObject.destroy();
    this.matter.world.remove(brickBody);

    this._reflectBall(pair, 2);
    this._incrementCombo();

    if (this.bricks) {
      this.bricks.remaining--;
      if (this.bricks.remaining <= 0) this._handleLevelClear();
    }
  }

  // Specular reflection using the collision normal from Matter.js.
  // Ball is a sensor so we own every velocity change — no engine impulse applied.
  _reflectBall(pair, jitterDeg) {
    const vel = this.ball.body.velocity;
    let { x: nx, y: ny } = pair.collision.normal;
    // Ensure normal points away from surface toward ball
    if (vel.x * nx + vel.y * ny > 0) { nx = -nx; ny = -ny; }
    const dot   = vel.x * nx + vel.y * ny;
    const speed = Math.hypot(vel.x, vel.y) || (this.targetPPS / 60);
    let rvx = vel.x - 2 * dot * nx;
    let rvy = vel.y - 2 * dot * ny;
    const rs = Math.hypot(rvx, rvy);
    if (rs > 0.01) { rvx = rvx / rs * speed; rvy = rvy / rs * speed; }
    MB().setVelocity(this.ball.body, { x: rvx, y: rvy });
    if (jitterDeg > 0) this.ball.jitter(jitterDeg);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game loop
  // ─────────────────────────────────────────────────────────────────────────
  update() {
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

    this._resolvePaddle();
    this._resolveWalls();
    this.ball.normalizeSpeed(this.targetPPS / 60);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game logic
  // ─────────────────────────────────────────────────────────────────────────
  _incrementCombo() {
    this.combo++;
    this.score += 100 * Math.ceil(this.combo / Cfg.comboStem2);

    // Speed escalates at milestones; stays at the new tier until scene restart.
    if      (this.combo === Cfg.comboStem2)  { this.targetPPS = Cfg.speedRecognition;   this._flashPhase('Recognition');  }
    else if (this.combo === Cfg.comboStem3)  { this.targetPPS = Cfg.speedDeepening;     this._flashPhase('Deepening');    }
    else if (this.combo === Cfg.comboStem4)  {                                           this._flashPhase('Transcendence');}
    else if (this.combo === Cfg.comboMirror) { this.targetPPS = Cfg.speedTranscendence; this._flashPhase('Mirror State'); }

    this._updateHUD();
  }

  _handleMiss() {
    this.combo = 0;
    this.resonance--;
    this._drawResOrbs();
    this._updateHUD();

    if (this.resonance <= 0) {
      this._gameOver();
      return;
    }

    this.ball.reset(this.paddle.x, this.ballRestY);
    this.hintText.setPosition(this.paddle.x, this.ballRestY - 40).setVisible(true);
  }

  _handleLevelClear() {
    const txt = this.add.text(this.W / 2, this.H / 2, 'Ascend.', {
      fontFamily: 'Georgia, serif',
      fontSize:   '36px',
      color:      '#C9A84C',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({ targets: txt, alpha: 1, duration: 1500, ease: 'Sine.easeIn' });
    this.time.delayedCall(3500, () => this.scene.restart());
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
