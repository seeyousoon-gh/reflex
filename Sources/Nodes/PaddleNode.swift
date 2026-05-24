import SpriteKit

final class PaddleNode: SKShapeNode {

    override init() {
        super.init()
        buildShape()
        buildPhysics()
    }

    required init?(coder: NSCoder) { super.init(coder: coder) }

    // MARK: - Setup

    private func buildShape() {
        let w = GameConfig.paddleWidth
        let h = GameConfig.paddleHeight
        let r = GameConfig.paddleCornerRadius
        let rect = CGRect(x: -w / 2, y: -h / 2, width: w, height: h)
        path        = CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil)
        fillColor   = GameConfig.colorIvory.withAlphaComponent(0.9)
        strokeColor = GameConfig.colorPrimaryGold
        lineWidth   = 1.5
        glowWidth   = 3
        zPosition   = GameConfig.zPaddle
    }

    private func buildPhysics() {
        let body = SKPhysicsBody(rectangleOf: CGSize(width: GameConfig.paddleWidth,
                                                     height: GameConfig.paddleHeight))
        body.isDynamic        = false
        body.restitution      = 1.0
        body.friction         = 0
        body.categoryBitMask  = GameConfig.paddleCategory
        body.collisionBitMask = GameConfig.ballCategory
        body.contactTestBitMask = GameConfig.ballCategory
        physicsBody = body
    }

    // MARK: - Movement

    /// Move paddle so its centre is at `x`, clamped within `playWidth`.
    func moveCentre(to x: CGFloat, playWidth: CGFloat) {
        let half    = GameConfig.paddleWidth / 2
        let clamped = min(max(x, half), playWidth - half)
        position.x  = clamped
    }
}
