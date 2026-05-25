import { Cfg }       from './config.js';
import { GameScene } from './scenes/GameScene.js';

const game = new Phaser.Game({
  type:            Phaser.AUTO,
  backgroundColor: Cfg.background,

  scale: {
    mode:       Phaser.Scale.RESIZE,   // fills the viewport on any iPhone
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  physics: {
    default: 'matter',
    matter:  {
      gravity:         { y: 0 },
      debug:           false,
      enableSleeping:  false,
    },
  },

  fps: {
    target:           60,
    forceSetTimeOut:  false,
  },

  disableContextMenu: true,
  banner:             false,
  scene:              [GameScene],
});

export default game;
