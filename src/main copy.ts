import {
  Engine,
  Actor,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  Transform,
  CollisionPreset,
  SceneComponent,
  type CollisionEvent,
  ResourceScope,
} from "edenmark";
import {
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  type Scene,
  Mesh,
  SceneLoader,
  type AssetContainer,
  Sound,
  type AbstractMesh,
} from "@babylonjs/core";
// PhysicsBody imports removed - using PhysicsComponent instead
import "@babylonjs/loaders/glTF"; // Required for GLB loading
import { TestPlayerController, PlayerPawn } from "./Player";
import { Collectible, HazardZone } from "./Collectible";
// Use the inspector
import "@babylonjs/inspector";

/**
 * A small sphere that orbits around its parent.
 */
class OrbitingSphere extends SceneComponent {
  private _sphere: Mesh | null = null;
  private _angle: number;
  private _radius: number;
  private _height: number;
  private _speed: number;
  private _color: Color3;

  constructor(config: {
    startAngle?: number;
    radius?: number;
    height?: number;
    speed?: number;
    color?: Color3;
    /** If true, maintains constant world scale regardless of parent. Default: false */
    absoluteScale?: boolean;
  } = {}) {
    super();
    this._angle = config.startAngle ?? 0;
    this._radius = config.radius ?? 0.8;
    this._height = config.height ?? 1.5;
    this._speed = config.speed ?? 2;
    this._color = config.color ?? new Color3(1, 1, 0);
    // Use SceneComponent's built-in absoluteScale flag
    this.absoluteScale = config.absoluteScale ?? false;
    this.tickEnabled = true;
  }

  protected override onRegisterWithScene(scene: Scene): void {
    this._sphere = MeshBuilder.CreateSphere(
      `OrbitSphere_${this.id}`,
      { diameter: 0.2 },
      scene
    );
    const mat = new StandardMaterial(`OrbitSphereMat_${this.id}`, scene);
    mat.diffuseColor = this._color;
    mat.emissiveColor = this._color.scale(0.3);
    this._sphere.material = mat;

    // Parent to our transform node
    if (this.transformNode) {
      this._sphere.parent = this.transformNode;
    }
  }

  protected override onTick(deltaTime: number): void {
    super.onTick(deltaTime); // Let SceneComponent handle absoluteScale

    this._angle += this._speed * deltaTime;

    // Update relative position to orbit
    const x = Math.cos(this._angle) * this._radius;
    const z = Math.sin(this._angle) * this._radius;
    this.relativeLocation = new Vector3(x, this._height, z);
  }

  protected override onDestroy(): void {
    if (this._sphere) {
      this._sphere.dispose();
      this._sphere = null;
    }
    super.onDestroy();
  }
}

/**
 * Trigger zone that scales actors when they enter.
 */
class ScaleZone extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  private _scaleFactor: number;
  private _scaledActors: Map<Actor, Vector3> = new Map(); // Original scales

  constructor(scaleFactor: number = 1.5) {
    super();
    this._scaleFactor = scaleFactor;
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`ScaleZone_${this.id}`, { size: 3 }, scene);
    const mat = new StandardMaterial(`ScaleZoneMat_${this.id}`, scene);
    mat.diffuseColor = new Color3(0.5, 0, 1); // Purple
    mat.alpha = 0.4;
    box.material = mat;
    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      collisionProfile: CollisionPreset.Trigger,
    });
  }

  override onTriggerEnter(event: CollisionEvent): void {
    const other = event.otherActor;
    if (!other || this._scaledActors.has(other)) return;

    // Store original scale and apply scale factor
    const root = other.rootComponent;
    if (root) {
      const originalScale = root.worldScale.clone();
      this._scaledActors.set(other, originalScale);
      root.worldScale = originalScale.scale(this._scaleFactor);
      console.log(`🔮 ${other.constructor.name} scaled to ${this._scaleFactor}x`);
    }
  }

  override onTriggerExit(event: CollisionEvent): void {
    const other = event.otherActor;
    if (!other) return;

    // Restore original scale
    const originalScale = this._scaledActors.get(other);
    if (originalScale) {
      const root = other.rootComponent;
      if (root) {
        root.worldScale = originalScale;
        console.log(`🔮 ${other.constructor.name} restored to normal size`);
      }
      this._scaledActors.delete(other);
    }
  }
}


/**
 * World terrain actor - owns visual mesh and uses PhysicsComponent.
 * Uses CONVEX_HULL shape type for reliable collision.
 */
class WorldTerrain extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  private _terrainMesh: AbstractMesh | null = null;

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  /** Set the terrain mesh before spawning (in configure callback) */
  setTerrainMesh(terrainMesh: AbstractMesh): void {
    this._terrainMesh = terrainMesh;
  }

  protected override onRegisterWithScene(_scene: Scene): void {
    if (!this._terrainMesh) {
      console.warn("WorldTerrain: No terrain mesh set");
      return;
    }

    console.log(`WorldTerrain: Setting up mesh "${this._terrainMesh.name}" with ${this._terrainMesh.getTotalVertices()} vertices`);

    // Bake world transform into vertices so physics shape matches visual position
    // This accounts for parent scaling (e.g., __root__ scaled to 0.5)
    if (this._terrainMesh instanceof Mesh) {
      this._terrainMesh.bakeCurrentTransformIntoVertices();
    }

    // Use the external mesh (from GLB)
    this.mesh.setMesh(this._terrainMesh);

    // Attach physics with CONVEX_HULL shape for reliable collision
    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.CONVEX_HULL,
      mass: 0, // static
      collisionProfile: CollisionPreset.Static,
    });

    console.log(`WorldTerrain: Physics attached to "${this._terrainMesh.name}"`);
  }
}

// ============================================================================
// Level Loading using ResourceManager
// ============================================================================

/**
 * Loads level resources (GLB world, background music) using ResourceManager.
 * Resources are scoped to World - they get cleaned up when world is destroyed.
 */
async function loadLevel(engine: Engine): Promise<void> {
  const scene = engine.scene;
  const resourceManager = engine.gameInstance.resourceManager;

  console.log("Loading level resources...");

  // Load the world GLB model (World scope - dies with world)
  const worldHandle = await resourceManager.load<AssetContainer>(
    "level:inferno_world",
    async () => {
      const container = await SceneLoader.LoadAssetContainerAsync(
        "/",
        "Inferno_World_free.glb",
        scene
      );
      return container;
    },
    ResourceScope.World,
    (container) => container.dispose()
  );

  // Add the loaded world to scene
  worldHandle.value.addAllToScene();

  // Scale and position the world
  const rootMesh = worldHandle.value.meshes.find(m => m.name === "__root__");
  if (rootMesh) {
    rootMesh.scaling.setAll(0.5);
    rootMesh.position.y = 0;
  }

  // Spawn WorldTerrain actors for meshes that have geometry
  // This properly integrates with engine's PhysicsSystem via PhysicsComponent
  const world = engine.world;
  let terrainCount = 0;
  for (const mesh of worldHandle.value.meshes) {
    // Skip non-geometry nodes
    if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) continue;
    if (mesh.name === "__root__") continue;

    try {
      const terrainMesh = mesh as AbstractMesh;
      world.spawn(WorldTerrain, Transform.identity(), (actor) => {
        actor.setTerrainMesh(terrainMesh);
      });
      terrainCount++;
    } catch (e) {
      console.warn(`Could not spawn terrain for mesh: ${mesh.name}`, e);
    }
  }

  console.log(`Loaded world with ${worldHandle.value.meshes.length} meshes, ${terrainCount} terrain actors`);

  // Load background music (World scope - stops when world is destroyed)
  await resourceManager.load<Sound>(
    "audio:background_music",
    async () => {
      return new Promise<Sound>((resolve) => {
        const music = new Sound(
          "BackgroundMusic",
          "/running.mp3",
          scene,
          () => {
            // Sound loaded callback
            music.setVolume(0.3);
            music.loop = true;
            music.play();
            console.log("Background music started");
            resolve(music);
          },
          { autoplay: false }
        );
      });
    },
    ResourceScope.World,
    (sound) => {
      sound.stop();
      sound.dispose();
    }
  );

  console.log("Level resources loaded!");
}

/**
 * Simple ground plane actor to test physics collision.
 */
class GroundPlane extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const ground = MeshBuilder.CreateGround(`Ground_${this.id}`, { width: 100, height: 100 }, scene);
    const mat = new StandardMaterial(`GroundMat_${this.id}`, scene);
    mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    ground.material = mat;
    this.mesh.setMesh(ground);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0, // static
      collisionProfile: CollisionPreset.Static,
    });
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const engine = new Engine({ canvas: "renderCanvas", tickRate: 60 });
  await engine.init();

  const scene = engine.scene;
  const world = engine.world;

  // Inspector
  scene.debugLayer.show({
    embedMode: true,
  });

  // Lighting
  const light = new HemisphericLight("Light", new Vector3(0, 1, 0), scene);
  light.intensity = 1.2;

  // Load level resources (GLB world with mesh physics + background music)
  await loadLevel(engine);

  // Simple ground plane at Y=0 to test physics
  world.spawn(GroundPlane, Transform.fromLocation(new Vector3(0, 0, 0)));
  console.log("Ground plane spawned at Y=0");

  // Player (local class with HealthComponent + ScoreComponent)
  // Create orbiting spheres
  const orb1 = new OrbitingSphere({
    startAngle: 0,
    radius: 0.6,
    height: 1.8,
    speed: 2,
    color: new Color3(0, 0.8, 1), // Cyan
    absoluteScale: false, // Scales with player
  });
  const orb2 = new OrbitingSphere({
    startAngle: Math.PI, // Opposite side
    radius: 0.6,
    height: 1.8,
    speed: 2,
    color: new Color3(1, 0.5, 0), // Orange
    absoluteScale: true, // Stays same size
  });

  // Spawn player with orbs added via configure callback (before registration)
  const player = world.spawn(PlayerPawn, Transform.fromLocation(new Vector3(0, 35, 0)), (p) => {
    p.addComponent(orb1);
    p.addComponent(orb2);
  });

  // Attach orbs to player mesh (after registration)
  orb1.attachTo(player.mesh);
  orb2.attachTo(player.mesh);

  const controller = new TestPlayerController();
  world.possess(controller, player);

  // Coins scattered around the level
  const coinPositions = [
    new Vector3(5, 2, 5),
    new Vector3(-5, 2, 5),
    new Vector3(5, 2, -5),
    new Vector3(-5, 2, -5),
    new Vector3(10, 2, 0),
    new Vector3(-10, 2, 0),
    new Vector3(0, 2, 10),
    new Vector3(0, 2, -10),
    new Vector3(15, 2, 15),
    new Vector3(-15, 2, -15),
  ];
  for (const pos of coinPositions) {
    world.spawn(Collectible, Transform.fromLocation(pos));
  }

  // Hazard zones
  world.spawn(HazardZone, Transform.fromLocation(new Vector3(8, 1, 8)));
  world.spawn(HazardZone, Transform.fromLocation(new Vector3(-8, 1, -8)));

  // Scale zone (purple) - makes player 1.5x bigger
  world.spawn(ScaleZone, Transform.fromLocation(new Vector3(0, 1.5, -8)));

  engine.start();

  console.log("===========================================");
  console.log("  Inferno World - Collect the Coins!");
  console.log("===========================================");
  console.log("WASD / Arrow Keys - Move");
  console.log("Right Mouse Button + Mouse - Look");
  console.log("Space - Jump");
  console.log("Gamepad supported!");
  console.log("");
  console.log("Yellow coins = +10 points");
  console.log("Red zones = -25 health");
  console.log("Purple zone = 1.5x size");
  console.log("===========================================");

  // Show ownership graph for debugging
  console.log("\nOwnership Graph:");
  console.log(engine.getOwnershipGraphString());

  // Show loaded resources
  console.log("\nLoaded Resources (World scope):");
  const worldResources = engine.gameInstance.resourceManager.getKeysForScope(ResourceScope.World);
  for (const key of worldResources) {
    console.log(`  - ${key}`);
  }
}

main();
