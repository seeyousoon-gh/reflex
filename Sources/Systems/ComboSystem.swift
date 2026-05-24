import Foundation

/// Combo tracking and milestone dispatch. Fully implemented in Layer 3.
final class ComboSystem {
    private(set) var combo = 0
    var onMilestone: ((Int) -> Void)?

    func increment() {
        combo += 1
        onMilestone?(combo)
    }

    func reset() { combo = 0 }
}
