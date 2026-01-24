import {
  Engine,
  Actor,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  Transform,
  AttachmentRule,
} from "edenmark";
import {
  Vector3,
  Quaternion,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  type Scene,
} from "@babylonjs/core";
import "@babylonjs/inspector";
import { PlayerPawn, CyclingPlayerController } from "./Player";

/**
 * A cube actor with physics.
 */
class PhysicsCubeActor extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  color: Color3 = new Color3(Math.random(), Math.random(), Math.random());

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`Box_${this.id}`, { size: 1 }, scene);

    const material = new StandardMaterial(`CubeMat_${this.id}`, scene);
    material.diffuseColor = this.color;
    box.material = material;

    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 1,
      restitution: 0.5,
      friction: 0.5,
    });

    this.physics.setDynamic();
  }

  protected override onBeginPlay(): void {
    this.physics.setAngularVelocity(
      new Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      )
    );
  }
}

/**
 * Simple cube actor without physics (for attachment demo).
 */
class CubeActor extends Actor {
  mesh = new MeshComponent();
  color: Color3 = new Color3(0.5, 0.5, 0.5);

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`Cube_${this.id}`, { size: 1 }, scene);

    const material = new StandardMaterial(`CubeMat_${this.id}`, scene);
    material.diffuseColor = this.color;
    box.material = material;

    this.mesh.setMesh(box);
  }
}

/**
 * Ground plane actor.
 */
class GroundActor extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const ground = MeshBuilder.CreateGround(
      `Ground_${this.id}`,
      { width: 20, height: 20 },
      scene
    );

    const material = new StandardMaterial(`GroundMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.4, 0.4, 0.4);
    ground.material = material;

    this.mesh.setMesh(ground);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      restitution: 0.3,
    });
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const engine = new Engine({
    canvas: "renderCanvas",
    tickRate: 60,
  });

  engine.timeScale = 1.5
  // Initialize physics and create world
  await engine.init();

  const scene = engine.scene;
  const world = engine.world;

  // Light
  const light = new HemisphericLight("MainLight", new Vector3(0, 1, 0), scene);
  light.intensity = 0.8;

  // Spawn ground
  world.spawn(GroundActor);

  // Spawn player
  const player = world.spawn(
    PlayerPawn,
    Transform.fromLocation(new Vector3(0, 2, -5))
     
  );
  const controller = new CyclingPlayerController();
  world.possess(controller, player);

  // Spawn physics cubes
  const positions = [
    new Vector3(-2, 5, 0),
    new Vector3(0, 7, 0),
    new Vector3(2, 9, 0),
    new Vector3(0.5, 11, 0.5),
    new Vector3(-0.5, 13, -0.5),
  ];

  for (const pos of positions) {
    world.spawn(PhysicsCubeActor, Transform.fromLocation(pos));
  }

  // Spawn attached cubes demo
  // Parent: red cube at height 3, rotated
  const parentCube = world.spawn(
    CubeActor,
    new Transform(
      new Vector3(5, 3, 0),
      Quaternion.FromEulerAngles(0, Math.PI / 4, Math.PI / 6),
      Vector3.One()
    ),
    (cube) => {
      cube.color = new Color3(0.9, 0.2, 0.2);
    }
  );

  // Child: blue cube attached to parent, offset by 2 units
  const childCube = world.spawn(
    CubeActor,
    undefined,
    (cube) => {
      cube.color = new Color3(0.2, 0.2, 0.9);
    }
  );

  // Attach child to parent
  childCube.attachToActor(parentCube, {
    locationRule: AttachmentRule.KeepWorld,
    rotationRule: AttachmentRule.KeepRelative,
    scaleRule: AttachmentRule.KeepRelative,
  });

  parentCube.attachToActor(player, {
    locationRule: AttachmentRule.SnapToTarget,
    rotationRule: AttachmentRule.KeepRelative,
    scaleRule: AttachmentRule.KeepRelative,
  });
  parentCube.rootComponent!.relativeLocation = new Vector3(2, 1, 0);  

  console.log("Attached cubes spawned - red (parent) and blue (child)");

  engine.start();
  console.log("Started with", world.actors.size, "actors");
  console.log("Controls: WASD to move, Space to jump, P to cycle input mode");

  // Show inspector
  scene.debugLayer.show({ embedMode: true });

  // Delayed spawn test
  setTimeout(() => {
    world.spawn(
      PhysicsCubeActor,
      Transform.fromLocation(new Vector3(0, 15, 0))
    );
    console.log("Spawned delayed cube");
  }, 5000);
}

main();
