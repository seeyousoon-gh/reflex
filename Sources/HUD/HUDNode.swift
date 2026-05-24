import SpriteKit

/// All HUD elements (resonance, combo, mirror meter, score). Fully implemented in Layer 8.
final class HUDNode: SKNode {
    func updateCombo(_ combo: Int) {}
    func updateScore(_ score: Int) {}
    func updateResonance(_ lives: Int) {}
    func updateMirrorMeter(_ fraction: CGFloat) {}
}
