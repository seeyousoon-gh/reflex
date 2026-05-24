import Foundation

/// Mirror State lifecycle manager. Fully implemented in Layer 6.
final class MirrorState {
    private(set) var isActive = false
    var onActivate: (() -> Void)?
    var onDeactivate: (() -> Void)?

    func activate() { isActive = true; onActivate?() }
    func deactivate() { isActive = false; onDeactivate?() }
}
