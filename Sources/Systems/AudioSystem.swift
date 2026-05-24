import AVFoundation

/// Stem + note playback. Fully implemented in Layer 4.
final class AudioSystem {
    static let shared = AudioSystem()
    private init() {}
    func setup() {}
    func activateStem(_ index: Int) {}
    func playNote(for brickType: String, sliceIndex: Int) {}
    func playSFX(_ name: String) {}
    func setMirrorState(_ active: Bool) {}
}
