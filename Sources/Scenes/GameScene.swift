import SpriteKit
import UIKit

// MARK: - Scene

final class GameScene: SKScene, SKPhysicsContactDelegate {

    // MARK: Nodes
    private var ball:   BallNode!
    private var paddle: PaddleNode!

    // MARK: Layout geometry (resolved after view attach)
    private var playField: CGRect = .zero   // excludes paddle zone
    private var paddleCentreY: CGFloat = 0
    private var ballRestY: CGFloat = 0

    // MARK: Touch tracking
    private var activeTouchID: UITouchHashValue = 0
    private var lastTouchX: CGFloat = 0

    // MARK: State
    private var resonance = 3          // lives
    private var combo     = 0
    private var score     = 0

    // MARK: Phase / speed
    private enum Phase { case awakening, recognition, deepening, flow, transcendence }
    private var phase: Phase = .awakening
    private var currentTargetSpeed: CGFloat = GameConfig.ballSpeedAwakening
    private var speedTransitionStart: TimeInterval = 0
    private var speedTransitionFrom:  CGFloat = GameConfig.ballSpeedAwakening
    private var speedTransitionTo:    CGFloat = GameConfig.ballSpeedAwakening
    private var isTransitioningSpeed  = false

    // MARK: - Lifecycle

    override func didMove(to view: SKView) {
        anchorPoint = CGPoint(x: 0, y: 0)   // bottom-left origin
        resolveLayout(view: view)
        setupPhysicsWorld()
        setupBackground()
        setupWalls()
        spawnPaddle()
        spawnBall()
    }

    // MARK: - Layout

    private func resolveLayout(view: SKView) {
        let insets = view.safeAreaInsets

        // Full safe area rect in scene coordinates (y-up)
        let safeRect = CGRect(
            x:      insets.left,
            y:      insets.bottom,
            width:  size.width  - insets.left - insets.right,
            height: size.height - insets.top  - insets.bottom
        )

        let paddleZoneH = safeRect.height * GameConfig.paddleZoneFraction
        paddleCentreY   = safeRect.minY + paddleZoneH * 0.4

        playField = CGRect(
            x:      safeRect.minX,
            y:      paddleCentreY + GameConfig.paddleHeight / 2 + 4,
            width:  safeRect.width,
            height: safeRect.height - paddleZoneH
        )

        ballRestY = paddleCentreY
                  + GameConfig.paddleHeight / 2
                  + GameConfig.ballRadius
                  + 4
    }

    // MARK: - Scene objects

    private func setupBackground() {
        backgroundColor = GameConfig.colorBackground
    }

    private func setupPhysicsWorld() {
        physicsWorld.gravity = .zero
        physicsWorld.contactDelegate = self
        physicsWorld.speed = 1
    }

    private func setupWalls() {
        // Left, right, top — static edge bodies.
        // Bottom is open; miss is detected in update().

        func makeWall(from a: CGPoint, to b: CGPoint) {
            let node = SKNode()
            let body = SKPhysicsBody(edgeFrom: a, to: b)
            body.restitution     = 1.0
            body.friction        = 0
            body.categoryBitMask = GameConfig.wallCategory
            body.collisionBitMask   = GameConfig.ballCategory
            body.contactTestBitMask = GameConfig.ballCategory
            node.physicsBody = body
            addChild(node)
        }

        makeWall(from: CGPoint(x: 0,          y: 0),
                 to:   CGPoint(x: 0,          y: size.height))  // left
        makeWall(from: CGPoint(x: size.width, y: 0),
                 to:   CGPoint(x: size.width, y: size.height))  // right
        makeWall(from: CGPoint(x: 0,          y: size.height),
                 to:   CGPoint(x: size.width, y: size.height))  // top
    }

    private func spawnPaddle() {
        paddle = PaddleNode()
        paddle.position = CGPoint(x: size.width / 2, y: paddleCentreY)
        addChild(paddle)
    }

    private func spawnBall() {
        ball = BallNode()
        ball.position = CGPoint(x: size.width / 2, y: ballRestY)
        ball.targetSpeed = currentTargetSpeed
        addChild(ball)
    }

    // MARK: - Touch Handling

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        activeTouchID = touch.hashValue
        lastTouchX    = touch.location(in: self).x

        if !ball.isLaunched {
            ball.launch()
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first(where: { $0.hashValue == activeTouchID }) else { return }
        let x    = touch.location(in: self).x
        let dx   = x - lastTouchX
        lastTouchX = x

        paddle.moveCentre(to: paddle.position.x + dx, playWidth: size.width)
        if !ball.isLaunched {
            ball.position.x = paddle.position.x
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {}
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {}

    // MARK: - Game Loop

    override func update(_ currentTime: TimeInterval) {
        if !ball.isLaunched {
            // Keep ball sitting on paddle before launch
            ball.position.x = paddle.position.x
            return
        }

        // Miss detection — ball dropped below paddle zone
        if ball.position.y < paddleCentreY - 40 {
            handleMiss()
            return
        }

        // Speed interpolation
        if isTransitioningSpeed {
            let elapsed  = currentTime - speedTransitionStart
            let duration = GameConfig.speedTransitionDuration
            let t        = CGFloat(min(elapsed / duration, 1.0))
            // Ease in-out
            let smooth   = t * t * (3 - 2 * t)
            currentTargetSpeed = speedTransitionFrom + (speedTransitionTo - speedTransitionFrom) * smooth
            ball.targetSpeed   = currentTargetSpeed
            if t >= 1 { isTransitioningSpeed = false }
        }

        // Clamp ball speed every frame (physics can drift)
        ball.normalizeSpeed()
    }

    // MARK: - Physics Contact

    func didBegin(_ contact: SKPhysicsContact) {
        let a = contact.bodyA.categoryBitMask
        let b = contact.bodyB.categoryBitMask

        if (a | b) == (GameConfig.ballCategory | GameConfig.wallCategory) {
            onWallContact()
        } else if (a | b) == (GameConfig.ballCategory | GameConfig.paddleCategory) {
            onPaddleContact(contact: contact)
        } else if (a | b) == (GameConfig.ballCategory | GameConfig.brickCategory) {
            let brickNode = (a == GameConfig.brickCategory ? contact.bodyA : contact.bodyB).node
            onBrickContact(brick: brickNode)
        }
    }

    // MARK: - Contact Handlers

    private func onWallContact() {
        // Very subtle jitter on wall to prevent perfectly vertical/horizontal loops
        ball.jitter(degrees: -1...1)
        // SFX placeholder: sfx_wall_bounce
    }

    private func onPaddleContact(contact: SKPhysicsContact) {
        // Steer ball based on hit position: edge hit → wider angle, center hit → straighter
        guard let body = ball.physicsBody else { return }
        let hitX    = contact.contactPoint.x
        let relX    = (hitX - paddle.position.x) / (GameConfig.paddleWidth / 2)  // -1 … +1
        let bias    = relX * 25 * .pi / 180   // up to ±25° steering
        let vel     = body.velocity
        let speed   = vel.magnitude
        let newAngle = atan2(vel.dy, vel.dx) + bias
        // abs(sin) ensures ball always exits paddle moving upward
        body.velocity = CGVector(dx: speed * cos(newAngle), dy: speed * abs(sin(newAngle)))
        ball.jitter(degrees: -1.5...1.5)
        // SFX placeholder: sfx_paddle_bounce
    }

    private func onBrickContact(brick: SKNode?) {
        guard let brick = brick else { return }
        // Will be expanded in Layer 2; for now remove immediately
        brick.removeFromParent()
        ball.jitter(degrees: -3...3)
        incrementCombo()
        score += 100
    }

    // MARK: - Combo

    private func incrementCombo() {
        combo += 1
        print("Combo: \(combo)")  // placeholder until HUD is wired in Layer 8
    }

    private func resetCombo() {
        combo = 0
    }

    // MARK: - Miss

    private func handleMiss() {
        resetCombo()
        resonance -= 1
        // SFX placeholder: sfx_miss

        if resonance <= 0 {
            handleGameOver()
            return
        }

        // Reset ball to paddle
        ball.reset(to: CGPoint(x: paddle.position.x, y: ballRestY))
        ball.targetSpeed = currentTargetSpeed
    }

    private func handleGameOver() {
        // Layer 7 will flesh this out; for now restart
        let reveal = SKAction.sequence([
            SKAction.wait(forDuration: 3),
            SKAction.run { [weak self] in self?.restartScene() }
        ])
        run(reveal)
    }

    private func restartScene() {
        guard let view = view else { return }
        let fresh = GameScene(size: size)
        fresh.scaleMode = scaleMode
        view.presentScene(fresh, transition: SKTransition.fade(withDuration: 1))
    }

    // MARK: - Speed Transition Helper (called by phase logic in Layer 3)

    func transitionSpeed(to newSpeed: CGFloat, at time: TimeInterval) {
        guard newSpeed != currentTargetSpeed else { return }
        speedTransitionFrom  = currentTargetSpeed
        speedTransitionTo    = newSpeed
        speedTransitionStart = time
        isTransitioningSpeed = true
    }
}

// Required by touch tracking to store a stable ID
private typealias UITouchHashValue = Int
