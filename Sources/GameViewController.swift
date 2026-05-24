import UIKit
import SpriteKit

final class GameViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let skView = view as? SKView else { return }

        let scene        = GameScene(size: view.bounds.size)
        scene.scaleMode  = .resizeFill

        // Debug overlays — disable for release
        skView.showsFPS            = false
        skView.showsNodeCount      = false
        skView.showsPhysics        = false
        skView.ignoresSiblingOrder = true

        skView.presentScene(scene)
    }

    override func loadView() {
        view = SKView(frame: UIScreen.main.bounds)
    }

    // Portrait lock
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
}
