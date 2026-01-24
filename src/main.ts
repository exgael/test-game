import {
  Engine,
  Actor,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  Transform,
  CollisionLayer,
  CollisionPreset,
  createCollisionProfile,
  CollisionResponse,
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

// ============================================================================
// Collision Playground - Testing collision layers, masks, and responses
// ============================================================================

/**
 * Ground plane - Static collision, blocks everything
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
    const ground = MeshBuilder.CreateGround("Ground", { width: 30, height: 30 }, scene);
    const material = new StandardMaterial("GroundMat", scene);
    material.diffuseColor = new Color3(0.3, 0.3, 0.3);
    ground.material = material;
    this.mesh.setMesh(ground);

    // Static ground - blocks all
    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      restitution: 0.3,
      collisionProfile: CollisionPreset.Static,
    });
  }
}

/**
 * Dynamic cube - normal physics, blocks other dynamics
 */
class DynamicCube extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();
  color: Color3;

  constructor() {
    super();
    this.color = new Color3(0.2, 0.6, 0.9); // Blue
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`DynamicCube_${this.id}`, { size: 1 }, scene);
    const material = new StandardMaterial(`DynamicMat_${this.id}`, scene);
    material.diffuseColor = this.color;
    box.material = material;
    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 1,
      restitution: 0.5,
      friction: 0.5,
      collisionProfile: CollisionPreset.Dynamic,
    });
    this.physics.setDynamic();
  }
}

/**
 * "Ghost" cube - ignores other dynamics, only collides with ground
 * Good for: non-blocking visual effects, pass-through objects
 */
class GhostCube extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`GhostCube_${this.id}`, { size: 1 }, scene);
    const material = new StandardMaterial(`GhostMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.9, 0.2, 0.9); // Magenta
    material.alpha = 0.6; // Semi-transparent
    box.material = material;
    this.mesh.setMesh(box);

    // Custom profile: only collides with Static/Ground, ignores Dynamic
    const ghostProfile = createCollisionProfile({
      layer: CollisionLayer.Dynamic,
      mask: CollisionLayer.Static | CollisionLayer.Ground, // Only hit ground
      defaultResponse: CollisionResponse.Block,
    });

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 1,
      restitution: 0.8,
      collisionProfile: ghostProfile,
    });
    this.physics.setDynamic();
  }
}

/**
 * Projectile - only hits Static and Actors, ignores other projectiles
 */
class ProjectileSphere extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const sphere = MeshBuilder.CreateSphere(`Projectile_${this.id}`, { diameter: 0.5 }, scene);
    const material = new StandardMaterial(`ProjectileMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.9, 0.9, 0.2); // Yellow
    material.emissiveColor = new Color3(0.3, 0.3, 0);
    sphere.material = material;
    this.mesh.setMesh(sphere);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.SPHERE,
      mass: 0.5,
      restitution: 0.9,
      collisionProfile: CollisionPreset.Projectile,
    });
    this.physics.setDynamic();
  }
}

/**
 * Trigger zone - overlaps, never blocks
 * Good for: damage zones, pickup areas, checkpoints
 */
class TriggerZone extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
    this.tickEnabled = true;
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`Trigger_${this.id}`, { size: 3 }, scene);
    const material = new StandardMaterial(`TriggerMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.2, 0.9, 0.2); // Green
    material.alpha = 0.3;
    box.material = material;
    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0, // Static trigger
      collisionProfile: CollisionPreset.Trigger,
    });
    this.physics.setStatic();
  }

  // Note: In a full implementation, you'd have overlap events from physics
  // For now, this is a visual placeholder showing the concept
}

/**
 * Wall that blocks everything
 */
class WallActor extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const wall = MeshBuilder.CreateBox(`Wall_${this.id}`, { width: 5, height: 3, depth: 0.5 }, scene);
    const material = new StandardMaterial(`WallMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.6, 0.4, 0.2); // Brown
    wall.material = material;
    this.mesh.setMesh(wall);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      collisionProfile: CollisionPreset.Static,
    });
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const engine = new Engine({
    canvas: "renderCanvas",
    tickRate: 60,
  });

  await engine.init();

  const scene = engine.scene;
  const world = engine.world;

  // Light
  const light = new HemisphericLight("MainLight", new Vector3(0, 1, 0), scene);
  light.intensity = 0.9;

  // Spawn player pawn and possess with controller
  const playerPawn = world.spawn(PlayerPawn);
  const playerController = new CyclingPlayerController();
  world.possess(playerController, playerPawn);

  // Ground
  world.spawn(GroundActor);

  // Wall in the middle
  world.spawn(WallActor, new Transform(
    new Vector3(0, 1.5, 5),
    Quaternion.Identity(),
    Vector3.One()
  ));

  // Trigger zone
  world.spawn(TriggerZone, new Transform(
    new Vector3(-5, 1.5, 0),
    Quaternion.Identity(),
    Vector3.One()
  ));

  // Spawn dynamic cubes (blue) - will collide with each other
  console.log("--- Spawning Dynamic Cubes (blue) ---");
  for (let i = 0; i < 3; i++) {
    world.spawn(DynamicCube, Transform.fromLocation(new Vector3(-2 + i * 2, 5 + i * 2, 0)));
  }

  // Spawn ghost cubes (magenta) - pass through dynamics, hit ground only
  console.log("--- Spawning Ghost Cubes (magenta) - pass through blue cubes ---");
  for (let i = 0; i < 3; i++) {
    world.spawn(GhostCube, Transform.fromLocation(new Vector3(-2 + i * 2, 8 + i * 2, 0)));
  }

  // Spawn projectiles (yellow) - pass through each other
  console.log("--- Spawning Projectiles (yellow) - pass through each other ---");
  setTimeout(() => {
    for (let i = 0; i < 5; i++) {
      const proj = world.spawn(ProjectileSphere, Transform.fromLocation(
        new Vector3(-4 + i * 2, 10, -3)
      ));
      // Give them velocity toward the wall
      proj.physics.setLinearVelocity(new Vector3(0, 0, 5));
    }
  }, 2000);

  engine.start();

  console.log("===========================================");
  console.log("Collision Playground");
  console.log("===========================================");
  console.log("Blue cubes: Dynamic - collide with everything");
  console.log("Magenta cubes: Ghost - pass through blues, hit ground only");
  console.log("Yellow spheres: Projectiles - pass through each other");
  console.log("Green box: Trigger zone - overlaps, never blocks");
  console.log("Brown wall: Static - blocks all");
  console.log("===========================================");

  // Inspector
  scene.debugLayer.show({ embedMode: true });

  // Keyboard controls for timeScale
  window.addEventListener("keydown", (e) => {
    if (e.key === "1") engine.timeScale = 0.1;
    if (e.key === "2") engine.timeScale = 0.5;
    if (e.key === "3") engine.timeScale = 1;
    if (e.key === "4") engine.timeScale = 2;
    if (e.key === "0") engine.timeScale = 0;
    if (e.key === " ") {
      // Drop more cubes
      world.spawn(DynamicCube, Transform.fromLocation(new Vector3(
        (Math.random() - 0.5) * 10,
        15,
        (Math.random() - 0.5) * 10
      )));
    }
  });

  console.log("Press 0-4 for timeScale (0=pause, 1=0.1x, 2=0.5x, 3=1x, 4=2x)");
  console.log("Press SPACE to drop more blue cubes");
}

main();
