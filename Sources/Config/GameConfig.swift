import CoreGraphics
import UIKit

enum GameConfig {

    // MARK: - Physics
    static let ballRadius: CGFloat = 8
    static let ballRestitution: CGFloat = 1.0
    static let paddleWidth: CGFloat = 110
    static let paddleHeight: CGFloat = 12
    static let paddleCornerRadius: CGFloat = 6

    // Ball speed in pts/sec per phase
    static let ballSpeedAwakening:   CGFloat = 320
    static let ballSpeedRecognition: CGFloat = 480
    static let ballSpeedDeepening:   CGFloat = 640
    static let ballSpeedTranscendence: CGFloat = 420   // Mirror State: slower

    // Speed transition duration (seconds)
    static let speedTransitionDuration: TimeInterval = 15

    // MARK: - Paddle Zone
    static let paddleZoneFraction: CGFloat = 0.15   // bottom 15 % of safe area

    // MARK: - Brick Rings
    static let outerRingCount  = 24
    static let middleRingCount = 20
    static let innerRingCount  = 12

    static let outerRingRadiusFraction:  CGFloat = 0.60
    static let middleRingRadiusFraction: CGFloat = 0.40
    static let innerRingRadiusFraction:  CGFloat = 0.22
    static let coreRadiusFraction:       CGFloat = 0.08

    // MARK: - Combo
    static let comboForStem2  = 5
    static let comboForStem3  = 10
    static let comboForStem4  = 20
    static let comboForMirror = 30

    // MARK: - Mirror State
    static let mirrorStateDuration: TimeInterval = 20

    // MARK: - Colors
    static let colorBackground = UIColor(hex: "#0A0614")!
    static let colorPrimaryGold = UIColor(hex: "#C9A84C")!
    static let colorIvory       = UIColor(hex: "#F0ECD8")!
    static let colorTeal        = UIColor(hex: "#4ECDC4")!
    static let colorBallDefault = UIColor.white
    static let colorTrailSilver = UIColor(hex: "#C0C0C8")!
    static let colorTrailGold   = UIColor(hex: "#FFD700")!

    // MARK: - Physics Category Bitmasks
    static let ballCategory:     UInt32 = 1 << 0
    static let brickCategory:    UInt32 = 1 << 1
    static let paddleCategory:   UInt32 = 1 << 2
    static let wallCategory:     UInt32 = 1 << 3

    // MARK: - Z-Positions
    static let zBackground: CGFloat = -10
    static let zBrick:      CGFloat = 1
    static let zPaddle:     CGFloat = 5
    static let zBall:       CGFloat = 6
    static let zParticles:  CGFloat = 7
    static let zHUD:        CGFloat = 10
    static let zOverlay:    CGFloat = 20
}
