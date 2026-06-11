import { Cfg }           from '../config.js';
import { Ball }          from '../objects/Ball.js';
import { Paddle }        from '../objects/Paddle.js';
import { Bricks }        from '../objects/Bricks.js';
import { AudioEngine }   from '../audio/AudioEngine.js';
import { Trail }         from '../vfx/Trail.js';
import { Particles }     from '../vfx/Particles.js';
import { InfinityMirror } from '../vfx/InfinityMirror.js';

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
    this.audio     = new AudioEngine();

    this._prevPaddleX       = this.W / 2;
    this._paddleVelPPF      = 0;
    this._paddleVelBuf      = [0, 0, 0, 0];
    this._reflectedThisStep = false;
    this._mirrorActive      = false;
    this._mirrorRings       = [];
    this._mirrorRingGfx     = null;
    this._mirrorTimer       = null;
    this._mirrorRingPhase   = 0;
    this._warnTween         = null;

    this.infinityMirror = new InfinityMirror(this);

    this._buildBackground();
    this._buildWalls();
    this._buildPaddle();
    this._buildBall();
    this._buildBricks();
    this._buildHUD();
    this._buildHintText();
    this._setupInput();
    this._setupCollisions();

    this.trail = new Trail(this, this.ball);
    this.vfx   = new Particles(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Scene construction
  // ─────────────────────────────────────────────────────────────────────────
  _buildBackground() {
    this.cameras.main.setBackgroundColor(Cfg.background);
    this._buildMandala();
  }

  _buildMandala() {
    const cx   = this.W / 2;
    const cy   = this.H * 0.36;
    const refR = this.W * 0.46;

    // Static layer: concentric rings at each brick-ring radius + central soft glow
    const bgS = this.add.graphics().setDepth(0).setPosition(cx, cy);
    [50, 32, 18, 8].forEach((r, i) => {
      bgS.fillStyle(Cfg.primaryGold, 0.013 - i * 0.002);
      bgS.fillCircle(0, 0, r);
    });
    [Cfg.melodyRadFrac, Cfg.outerRadFrac, Cfg.middleRadFrac, Cfg.innerRadFrac].forEach(f => {
      bgS.lineStyle(0.6, Cfg.ivory, 0.055);
      bgS.strokeCircle(0, 0, refR * f);
    });

    // Layer 1: 18 radial spokes — slow clockwise
    this._bgL1 = this.add.graphics().setDepth(0).setPosition(cx, cy);
    for (let i = 0; i < 18; i++) {
      const a = (2 * Math.PI * i) / 18;
      this._bgL1.lineStyle(0.6, Cfg.primaryGold, 0.07);
      this._bgL1.beginPath();
      this._bgL1.moveTo(0, 0);
      this._bgL1.lineTo(Math.cos(a) * refR * 0.88, Math.sin(a) * refR * 0.88);
      this._bgL1.strokePath();
    }

    // Layer 2: 12 small diamonds at 70% radius — slow counter-clockwise
    this._bgL2 = this.add.graphics().setDepth(0).setPosition(cx, cy);
    const r2   = refR * 0.70;
    const ds   = 4;
    for (let i = 0; i < 12; i++) {
      const a  = (2 * Math.PI * i) / 12;
      const rx = Math.cos(a) * r2;
      const ry = Math.sin(a) * r2;
      this._bgL2.fillStyle(Cfg.teal, 0.11);
      this._bgL2.fillTriangle(rx, ry - ds, rx + ds * 0.7, ry, rx, ry + ds);
      this._bgL2.fillTriangle(rx, ry - ds, rx - ds * 0.7, ry, rx, ry + ds);
    }
  }

  _buildWalls() {}

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
  //  HUD — resonance orbs · combo · score · mirror meter · phase label
  // ─────────────────────────────────────────────────────────────────────────
  _buildHUD() {
    const y = 28;

    this._resGfx = this.add.graphics().setDepth(10);
    this._drawResOrbs();

    this._comboTxt = this.add.text(20, y, '', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#C9A84C',
    }).setOrigin(0, 0.5).setDepth(10).setAlpha(0.75);

    this._scoreTxt = this.add.text(this.W - 20, y, '0', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#F0ECD8',
    }).setOrigin(1, 0.5).setDepth(10).setAlpha(0.45);

    // Mirror meter: thin line below orbs, expands from centre as combo grows
    this._meterGfx = this.add.graphics().setDepth(10);
    this._drawMirrorMeter();

    // Melody progress: 16 dots tracking position in Ode to Joy phrase
    this._arcGfx    = this.add.graphics().setDepth(10);
    this._arcFlashAt = -1000;
    this._drawMelodyArc();

    // Persistent phase label — bottom centre, very faint
    this._phaseTxt = this.add.text(this.W / 2, this.H - 22, '', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#C9A84C',
    }).setOrigin(0.5, 1).setDepth(10).setAlpha(0.22);
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

  _drawMirrorMeter() {
    const gfx      = this._meterGfx;
    gfx.clear();
    const progress = Math.min(this.combo / Cfg.comboMirror, 1.0);
    if (progress <= 0) return;

    const y  = 46;
    const cx = this.W / 2;
    const hw = this.W * 0.38 * progress;
    const a  = 0.15 + progress * 0.45;

    gfx.lineStyle(1, Cfg.primaryGold, a);
    gfx.beginPath();
    gfx.moveTo(cx - hw, y);
    gfx.lineTo(cx + hw, y);
    gfx.strokePath();

    gfx.fillStyle(Cfg.primaryGold, a * 1.3);
    gfx.fillCircle(cx - hw, y, 1.5);
    gfx.fillCircle(cx + hw, y, 1.5);
  }

  _flashPhase(name) {
    this._phaseTxt.setText(name);

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

  _drawMelodyArc() {
    const gfx      = this._arcGfx;
    gfx.clear();
    const N        = 16;
    const margin   = this.W * 0.12;
    const y        = 70;
    const spacing  = (this.W - 2 * margin) / (N - 1);
    const cursor   = this.audio._melodyCursor % N;
    const flashing = (this.time.now - this._arcFlashAt) < 220;

    for (let i = 0; i < N; i++) {
      const x       = margin + i * spacing;
      const active  = i === cursor;
      const flashed = active && flashing;
      gfx.fillStyle(
        active ? Cfg.primaryGold : Cfg.ivory,
        flashed ? 1.0 : active ? 0.70 : 0.18,
      );
      gfx.fillCircle(x, y, flashed ? 3.0 : active ? 2.2 : 1.3);
    }
  }

  _updateHUD() {
    this._comboTxt.setText(this.combo > 1 ? `× ${this.combo}` : '');
    this._scoreTxt.setText(`${this.score}`);
    this._drawMirrorMeter();
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
      this.audio.unlock();
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
    this.audio.startAmbient();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Collisions
  // ─────────────────────────────────────────────────────────────────────────
  _setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const la = pair.bodyA.label;
        const lb = pair.bodyB.label;
        if ((la === 'ball' || lb === 'ball') && (la === 'brick' || lb === 'brick')) {
          this._onBrickHit(la === 'brick' ? pair.bodyA : pair.bodyB, pair);
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
    let side = null;

    if (py - r <= 0 && vy < 0)      { vy = Math.abs(vy);  py = r + 1;          side = 'top'; }
    if (px - r <= 0 && vx < 0)      { vx = Math.abs(vx);  px = r + 1;          side = side || 'left'; }
    if (px + r >= this.W && vx > 0) { vx = -Math.abs(vx); px = this.W - r - 1; side = side || 'right'; }

    if (side) {
      MB().setPosition(this.ball.body, { x: px, y: py });
      MB().setVelocity(this.ball.body, { x: vx, y: vy });
      this.ball.jitter(1);
      this.audio.wallHit(side);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Manual paddle collision (SAT, no Matter.js body)
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

    if (bx + r < px - halfW || bx - r > px + halfW) return;
    if (by + r < py - halfH || by - r > py + halfH) return;

    const overlapTop   = (by + r) - (py - halfH);
    const overlapLeft  = (bx + r) - (px - halfW);
    const overlapRight = (px + halfW) - (bx - r);
    const minHoriz     = Math.min(overlapLeft, overlapRight);

    if (overlapTop <= minHoriz && vel.y > 0) {
      MB().setPosition(this.ball.body, { x: bx, y: py - halfH - r - 1 });
      this._applyTopFaceBounce(bx);
    } else if (overlapTop > minHoriz) {
      const minSpeed = (this.targetPPS / 60) * 0.5;
      if (overlapLeft <= overlapRight) {
        MB().setPosition(this.ball.body, { x: px - halfW - r - 1, y: by });
        MB().setVelocity(this.ball.body, { x: -Math.max(Math.abs(vel.x), minSpeed), y: vel.y });
      } else {
        MB().setPosition(this.ball.body, { x: px + halfW + r + 1, y: by });
        MB().setVelocity(this.ball.body, { x:  Math.max(Math.abs(vel.x), minSpeed), y: vel.y });
      }
    }
  }

  _applyTopFaceBounce(contactX) {
    const vel   = this.ball.body.velocity;
    const speed = Math.hypot(vel.x, vel.y) || (this.targetPPS / 60);

    const halfW       = Cfg.paddleWidth / 2;
    const relX        = Phaser.Math.Clamp((contactX - this.paddle.x) / halfW, -1, 1);
    const effectiveRX = Math.abs(relX) > 0.85 ? Math.sign(relX) : relX;
    const baseDeg     = 90 - effectiveRX * Cfg.paddleSteeringRange;
    const swipeNorm   = Phaser.Math.Clamp(this._paddleVelPPF / Cfg.paddleSwipeNormPPF, -1, 1);
    const finalDeg    = Phaser.Math.Clamp(baseDeg - swipeNorm * Cfg.paddleSwipeMaxDeg, 18, 162);
    const finalRad    = Phaser.Math.DegToRad(finalDeg);

    MB().setVelocity(this.ball.body, {
      x:  Math.cos(finalRad) * speed,
      y: -Math.sin(finalRad) * speed,
    });
    this.ball.jitter(0.5);
    this.audio.paddleTick();
  }

  _onBrickHit(brickBody, pair) {
    if (brickBody._destroyed) return;

    if (brickBody._indestructible) {
      if (!this._reflectedThisStep) {
        this._reflectBall(pair, 1);
        this._reflectedThisStep = true;
      }
      this.audio.corePing();
      return;
    }

    const bx    = brickBody.position.x;
    const by    = brickBody.position.y;
    const color = brickBody._color ?? 0xFFFFFF;

    brickBody._destroyed = true;
    if (brickBody.gameObject) brickBody.gameObject.destroy();
    this.matter.world.remove(brickBody);

    const ringColor = brickBody._ringIndex <= 1 ? Cfg.primaryGold : Cfg.teal;
    this.vfx.spawnBurst(bx, by, color);
    this.vfx.spawnRing(bx, by, ringColor);
    this.audio.brickNote(brickBody._waveType, brickBody._ringIndex);
    this.audio.activateStep(brickBody._ringIndex, brickBody._stepIndex);
    if (brickBody._isBeat) this.audio.chordStab();
    this._arcFlashAt = this.time.now;
    if (!this._reflectedThisStep) {
      this._reflectBall(pair, 2);
      this._reflectedThisStep = true;
    }
    this._incrementCombo();

    if (this.bricks) {
      this.bricks.remaining--;
      if (this.bricks.remaining <= 0) this._handleLevelClear();
    }
  }

  _reflectBall(pair, jitterDeg) {
    const vel = this.ball.body.velocity;
    let { x: nx, y: ny } = pair.collision.normal;
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
    this._reflectedThisStep = false;
    this.infinityMirror.update();

    // Mandala rotation — 4× faster during Mirror State
    const rotMult = this._mirrorActive ? 4 : 1;
    this._bgL1.rotation += 0.0003 * rotMult;
    this._bgL2.rotation -= 0.0002 * rotMult;

    this.trail.update();
    this.vfx.update();
    this._drawMelodyArc();

    // Mirror State: expanding ring pulses from mandala centre
    if (this._mirrorActive && this._mirrorRingGfx) {
      const cx = this.W / 2, cy = this.H * 0.36;
      this._mirrorRingGfx.clear();
      this._mirrorRings = this._mirrorRings.filter(r => r.alpha > 0.02);
      for (const ring of this._mirrorRings) {
        ring.r     += 1.6;
        ring.alpha -= 0.007;
        this._mirrorRingGfx.lineStyle(1.5, ring.color, ring.alpha);
        this._mirrorRingGfx.strokeCircle(cx, cy, ring.r);
      }
    }

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

    // Couple sequencer BPM to ball speed (90 BPM at launch → 150 BPM at max)
    const bpm = Math.round(90 + (this.targetPPS - Cfg.speedAwakening) /
                (Cfg.speedDeepening - Cfg.speedAwakening) * 60);
    this.audio.setBPM(bpm);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Game logic
  // ─────────────────────────────────────────────────────────────────────────
  _incrementCombo() {
    this.combo++;
    this.score += 100 * Math.ceil(this.combo / Cfg.comboStem2);

    if      (this.combo === Cfg.comboStem2)  { this.targetPPS = Cfg.speedRecognition;   this._flashPhase('Recognition');   this.audio.unlockStem(1); }
    else if (this.combo === Cfg.comboStem3)  { this.targetPPS = Cfg.speedDeepening;     this._flashPhase('Deepening');     this.audio.unlockStem(2); }
    else if (this.combo === Cfg.comboStem4)  {                                           this._flashPhase('Transcendence'); this.audio.unlockStem(3); }
    else if (this.combo === Cfg.comboMirror) {
      this.targetPPS = Cfg.speedTranscendence;
      this._flashPhase('Mirror State');
      this.audio.startMirror();
      this._startMirrorVisuals();
      this.time.delayedCall(Cfg.mirrorDuration * 1000, () => {
        this.audio.endMirror();
        this._stopMirrorVisuals();
      });
    }

    this._updateHUD();
  }

  _handleMiss() {
    this.combo = 0;
    this.resonance--;
    this._drawResOrbs();
    this._updateHUD();
    this.audio.missTone();
    this._missFlash();

    if (this.resonance <= 0) {
      this._gameOver();
      return;
    }

    if (this.resonance === 1) this._startResonanceWarning();

    this.ball.reset(this.paddle.x, this.ballRestY);
    this.hintText.setPosition(this.paddle.x, this.ballRestY - 40).setVisible(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Layer 6 — Mirror State visuals
  // ─────────────────────────────────────────────────────────────────────────
  _startMirrorVisuals() {
    this._mirrorActive    = true;
    this._mirrorRings     = [];
    this._mirrorRingPhase = 0;
    this._mirrorRingGfx   = this.add.graphics().setDepth(3);

    this.cameras.main.flash(700, 160, 80, 255);

    this._mirrorTimer = this.time.addEvent({
      delay: 550, repeat: -1,
      callback: () => {
        const color = (this._mirrorRingPhase++ % 2 === 0) ? Cfg.teal : Cfg.primaryGold;
        this._mirrorRings.push({ r: 18, alpha: 0.55, color });
      },
    });
  }

  _stopMirrorVisuals() {
    this._mirrorActive = false;
    if (this._mirrorTimer)   { this._mirrorTimer.remove();    this._mirrorTimer   = null; }
    if (this._mirrorRingGfx) { this._mirrorRingGfx.destroy(); this._mirrorRingGfx = null; }
    this._mirrorRings = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Layer 7 — Resonance polish
  // ─────────────────────────────────────────────────────────────────────────
  _missFlash() {
    this.cameras.main.shake(220, 0.006);
    const ov = this.add.graphics().setDepth(20);
    ov.fillStyle(0xFF1A1A, 1);
    ov.fillRect(0, 0, this.W, this.H);
    ov.setAlpha(0);
    this.tweens.add({
      targets: ov, alpha: { from: 0.22, to: 0 },
      duration: 380, ease: 'Sine.easeOut',
      onComplete: () => ov.destroy(),
    });
  }

  _startResonanceWarning() {
    if (this._warnTween) this._warnTween.stop();
    this._warnTween = this.tweens.add({
      targets: this._resGfx,
      alpha: { from: 1, to: 0.22 },
      duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  End states
  // ─────────────────────────────────────────────────────────────────────────
  _handleLevelClear() {
    this._stopMirrorVisuals();
    this.audio.stop();
    this.audio.clearArpeggio();

    const txt = this.add.text(this.W / 2, this.H / 2, 'Ascend.', {
      fontFamily: 'Georgia, serif', fontSize: '36px', color: '#C9A84C',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({ targets: txt, alpha: 1, duration: 1500, ease: 'Sine.easeIn' });
    this.time.delayedCall(3500, () => this.scene.restart());
  }

  _gameOver() {
    this._stopMirrorVisuals();
    this.audio.stop();
    this.audio.gameOverTone();
    this.ball.reset(this.W / 2, this.ballRestY);

    const txt = this.add.text(this.W / 2, this.H / 2, 'Return.', {
      fontFamily: 'Georgia, serif', fontSize: '36px', color: '#F0ECD8',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({ targets: txt, alpha: 1, duration: 1500, ease: 'Sine.easeIn' });
    this.time.delayedCall(3000, () => this.scene.restart());
  }
}
