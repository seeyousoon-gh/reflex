import UIKit
import CoreGraphics

extension UIColor {
    convenience init?(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") { cleaned.removeFirst() }
        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else { return nil }
        self.init(
            red:   CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >>  8) & 0xFF) / 255,
            blue:  CGFloat( value        & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension CGVector {
    var magnitude: CGFloat { sqrt(dx * dx + dy * dy) }
    func normalized() -> CGVector {
        let m = magnitude
        return m > 0 ? CGVector(dx: dx / m, dy: dy / m) : self
    }
    func scaled(to speed: CGFloat) -> CGVector {
        let n = normalized()
        return CGVector(dx: n.dx * speed, dy: n.dy * speed)
    }
}
