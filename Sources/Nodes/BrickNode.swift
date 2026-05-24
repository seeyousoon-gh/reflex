import SpriteKit

enum BrickType {
    case crystal   // outer ring, 1 hit, hexagon
    case amber     // middle ring, 2 hits, octagon
    case void      // inner ring, 3 hits, pentagon
    case core      // center, indestructible
}

final class BrickNode: SKShapeNode {

    let brickType: BrickType
    private(set) var hitsRemaining: Int
    let ringIndex: Int      // 0 outer, 1 middle, 2 inner
    let sliceIndex: Int     // angular position within ring

    init(type: BrickType, ringIndex: Int, sliceIndex: Int) {
        self.brickType    = type
        self.ringIndex    = ringIndex
        self.sliceIndex   = sliceIndex
        switch type {
        case .crystal: hitsRemaining = 1
        case .amber:   hitsRemaining = 2
        case .void:    hitsRemaining = 3
        case .core:    hitsRemaining = Int.max
        }
        super.init()
        // Full implementation in Layer 2
    }

    required init?(coder: NSCoder) { fatalError() }

    /// Returns true if the brick was destroyed.
    @discardableResult
    func hit() -> Bool {
        guard brickType != .core else { return false }
        hitsRemaining -= 1
        updateAppearance()
        return hitsRemaining <= 0
    }

    private func updateAppearance() {
        // Visual crack/fade feedback — fully implemented in Layer 2
    }
}
