export const Cfg = {
  // ── Colors (Phaser hex numbers) ──────────────────────────────────────────
  background:   0x0A0614,
  primaryGold:  0xC9A84C,
  ivory:        0xF0ECD8,
  teal:         0x4ECDC4,
  silver:       0xC0C0C8,
  gold:         0xFFD700,

  // ── Ball ──────────────────────────────────────────────────────────────────
  ballRadius: 8,

  // Speeds in px/second — divided by 60 when set as px/frame
  speedAwakening:    320,
  speedRecognition:  480,
  speedDeepening:    640,
  speedTranscendence: 420,   // Mirror State: slower

  // ── Paddle ────────────────────────────────────────────────────────────────
  paddleWidth:  110,
  paddleHeight:  12,
  paddleYFrac:  0.88,         // fraction of screen height from top

  // ── Brick rings ───────────────────────────────────────────────────────────
  outerCount:  24,
  middleCount: 20,
  innerCount:  12,
  outerRadFrac:  0.60,
  middleRadFrac: 0.40,
  innerRadFrac:  0.22,

  // ── Combo milestones ──────────────────────────────────────────────────────
  comboStem2:  5,
  comboStem3:  10,
  comboStem4:  20,
  comboMirror: 30,

  // ── Mirror State ──────────────────────────────────────────────────────────
  mirrorDuration: 20,   // seconds
};
