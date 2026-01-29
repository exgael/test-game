import {
  Engine,
  Actor,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  Transform,
  CollisionPreset,
} from "edenmark";
import {
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  type Scene,
  FreeCamera,
} from "@babylonjs/core";
import { WebXRDefaultExperience } from "@babylonjs/core/XR";
import "@babylonjs/loaders/glTF"; // Required for controller/hand mesh loading

/**
 * Simple ground plane.
 */
class Ground extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const ground = MeshBuilder.CreateGround("Ground", { width: 50, height: 50 }, scene);
    const mat = new StandardMaterial("GroundMat", scene);
    mat.diffuseColor = new Color3(0.3, 0.5, 0.3);
    ground.material = mat;
    this.mesh.setMesh(ground);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      collisionProfile: CollisionPreset.Static,
    });
  }
}

/**
 * A falling box.
 */
class FallingBox extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`Box_${this.id}`, { size: 1 }, scene);
    const mat = new StandardMaterial(`BoxMat_${this.id}`, scene);
    mat.diffuseColor = new Color3(0.8, 0.2, 0.2);
    box.material = mat;
    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 1,
      restitution: 0.5,
      collisionProfile: CollisionPreset.Actor,
    });
  }
}

async function main(): Promise<void> {
  const engine = new Engine({ canvas: "renderCanvas", tickRate: 60 });
  await engine.init();

  const scene = engine.scene;
  const world = engine.world;

  // Lighting
  new HemisphericLight("Light", new Vector3(0, 1, 0), scene);

  // Camera (for non-VR viewing)
  const camera = new FreeCamera("Camera", new Vector3(0, 5, -15), scene);
  camera.setTarget(Vector3.Zero());
  camera.attachControl(engine.canvas, true);

  // Ground
  world.spawn(Ground, Transform.fromLocation(Vector3.Zero()));

  // Spawn some falling boxes
  for (let i = 0; i < 5; i++) {
    world.spawn(
      FallingBox,
      Transform.fromLocation(new Vector3(i * 2 - 4, 5 + i * 2, 0))
    );
  }

  // WebXR with controller velocity tracking
  const xr = await WebXRDefaultExperience.CreateAsync(scene, {
    floorMeshes: [], // Ground mesh could go here
  });

  // Track previous positions for manual velocity calculation
  const prevPositions = new Map<string, { pos: Vector3; time: number }>();

  xr.input.onControllerAddedObservable.add((controller) => {
    const hand = controller.inputSource.handedness;
    console.log("Controller added:", hand);

    scene.onBeforeRenderObservable.add(() => {
      const frame = xr.baseExperience.sessionManager.currentFrame;
      if (!frame) return;

      const refSpace = xr.baseExperience.sessionManager.referenceSpace;
      if (!refSpace || !controller.inputSource.gripSpace) return;

      const pose = frame.getPose(controller.inputSource.gripSpace, refSpace);
      if (!pose) return;

      const pos = pose.transform.position;
      const currentPos = new Vector3(pos.x, pos.y, pos.z);
      const now = performance.now();

      if (pose.linearVelocity) {
        // Native WebXR velocity available
        console.log(
          `${hand} native velocity:`,
          pose.linearVelocity.x.toFixed(2),
          pose.linearVelocity.y.toFixed(2),
          pose.linearVelocity.z.toFixed(2)
        );
      } else {
        // Manual velocity from position delta
        const prev = prevPositions.get(hand);
        if (prev) {
          const dt = (now - prev.time) / 1000; // seconds
          if (dt > 0.001) {
            const velocity = currentPos.subtract(prev.pos).scale(1 / dt);
            const speed = velocity.length();
            if (speed > 0.1) {
              console.log(
                `${hand} computed velocity:`,
                velocity.x.toFixed(2),
                velocity.y.toFixed(2),
                velocity.z.toFixed(2),
                `(${speed.toFixed(2)} m/s)`
              );
            }
          }
        }
      }

      prevPositions.set(hand, { pos: currentPos, time: now });
    });
  });

  // Start
  engine.start();
}

main().catch(console.error);
