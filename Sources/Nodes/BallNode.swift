import SpriteKit

final class BallNode: SKShapeNode {

    private(set) var isLaunched = false

    // Current target speed — updated by game phase transitions
    var targetSpeed: CGFloat = GameConfig.ballSpeedAwakening

    override init() {
        super.init()
        buildShape()
        buildPhysics()
    }

    required init?(coder: NSCoder) { super.init(coder: coder) }

    // MARK: - Setup

    private func buildShape() {
        let r = GameConfig.ballRadius
        path = CGPath(ellipseIn: CGRect(x: -r, y: -r, width: r * 2, height: r * 2), transform: nil)
        fillColor   = GameConfig.colorBallDefault
        strokeColor = .clear
        zPosition   = GameConfig.zBall
    }

    private func buildPhysics() {
        let body = SKPhysicsBody(circleOfRadius: GameConfig.ballRadius)
        body.restitution     = GameConfig.ballRestitution
        body.linearDamping   = 0
        body.angularDamping  = 0
        body.friction        = 0
        body.allowsRotation  = false
        body.isDynamic       = true
        body.categoryBitMask    = GameConfig.ballCategory
        body.collisionBitMask   = GameConfig.brickCategory | GameConfig.paddleCategory | GameConfig.wallCategory
        body.contactTestBitMask = GameConfig.brickCategory | GameConfig.paddleCategory | GameConfig.wallCategory
        physicsBody = body
    }

    // MARK: - Launch

    func launch() {
        guard !isLaunched else { return }
        isLaunched = true
        // Random angle: 45°–135° from the positive-x axis (i.e., somewhere upward)
        let degrees = CGFloat.random(in: 50...130)
        let radians = degrees * .pi / 180
        let speed   = targetSpeed
        physicsBody?.velocity = CGVector(dx: speed * cos(radians), dy: speed * sin(radians))
    }

    // MARK: - Speed maintenance

    /// Call after each physics contact to clamp speed to current target.
    func normalizeSpeed() {
        guard let body = physicsBody, isLaunched else { return }
        guard body.velocity.magnitude > 1 else { return }
        body.velocity = body.velocity.scaled(to: targetSpeed)
    }

    /// Apply a tiny random rotation to the velocity to break repeating patterns.
    func jitter(degrees range: ClosedRange<CGFloat> = -3...3) {
        guard let body = physicsBody, body.velocity.magnitude > 1 else { return }
        let angle   = CGFloat.random(in: range) * .pi / 180
        let cos_a   = cos(angle), sin_a = sin(angle)
        let vx      = body.velocity.dx, vy = body.velocity.dy
        body.velocity = CGVector(dx: vx * cos_a - vy * sin_a,
                                 dy: vx * sin_a + vy * cos_a)
    }

    func reset(to position: CGPoint) {
        isLaunched = false
        physicsBody?.velocity = .zero
        self.position = position
    }
}
