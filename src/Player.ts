import {
  Pawn,
  PlayerController,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  CameraComponent,
  CameraArmComponent,
  ActorComponent,
  type CollisionHandler,
  type CollisionEvent,
  CollisionPreset,
  GroundDetector,
  type InputContext,
  type InputAction,
  InputValueType,
  InputDevice,
} from "edenmark";
import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  type Scene,
  Vector2,
} from "@babylonjs/core";
import { Collectible, HazardZone } from "./Collectible";


/**
 * Tracks health and handles damage from collisions.
 */
export class HealthComponent extends ActorComponent implements CollisionHandler {
  private _health: number;
  private _maxHealth: number;

  constructor(maxHealth: number = 100) {
    super();
    this._maxHealth = maxHealth;
    this._health = maxHealth;
  }

  get health(): number {
    return this._health;
  }

  get maxHealth(): number {
    return this._maxHealth;
  }

  get isDead(): boolean {
    return this._health <= 0;
  }

  applyDamage(amount: number): void {
    if (this.isDead) return;
    this._health = Math.max(0, this._health - amount);
    console.log(`Health: ${this._health}/${this._maxHealth}`);
    if (this.isDead) {
      console.log("DEAD!");
    }
  }

  heal(amount: number): void {
    this._health = Math.min(this._maxHealth, this._health + amount);
  }

  onTriggerEnter(event: CollisionEvent): void {
    console.log(`[HealthComponent] onTriggerEnter: other=${event.otherActor?.constructor.name}`);
    // Check if we entered a hazard
    if (event.otherActor instanceof HazardZone) {
      this.applyDamage(event.otherActor.damage);
    }
  }
}

/**
 * Tracks score from collectibles.
 */
export class ScoreComponent extends ActorComponent implements CollisionHandler {
  private _score: number = 0;

  get score(): number {
    return this._score;
  }

  addScore(points: number): void {
    this._score += points;
    console.log(`Score: ${this._score}`);
  }

  onTriggerEnter(event: CollisionEvent): void {
    console.log(`[ScoreComponent] onTriggerEnter: other=${event.otherActor?.constructor.name}`);
    if (event.otherActor instanceof Collectible) {
      this.addScore(event.otherActor.points);
      event.otherActor.collect();
    }
  }
}

/**
 * Player pawn - a controllable capsule with physics.
 *
 * Game-specific pawn with custom input methods.
 * The controller calls these methods to control the pawn.
 */
export class PlayerPawn extends Pawn {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();
  cameraArm = new CameraArmComponent({ distance: 8, heightOffset: 2 });
  camera = new CameraComponent();

  private _moveSpeed: number = 5;
  private _jumpForce: number = 5;

  // Intent state (written by controller, read in tick)
  private _moveInput: Vector2 = Vector2.Zero();
  private _lookInput: Vector2 = Vector2.Zero();
  private _pendingJump: boolean = false;

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
    this.addComponent(new GroundDetector({rayOffset: 1.0, footRadius: 0.4, debug: true}));
    this.addComponent(this.cameraArm);
    this.addComponent(this.camera);
    this.addComponent(new HealthComponent(100));
    this.addComponent(new ScoreComponent());
    this.tickEnabled = true;
  }

  protected override onRegisterWithScene(scene: Scene): void {
    // Create capsule mesh
    const capsule = MeshBuilder.CreateCapsule(
      `PlayerCapsule_${this.id}`,
      { height: 2, radius: 0.5 },
      scene
    );

    const material = new StandardMaterial(`PlayerMat_${this.id}`, scene);
    material.diffuseColor = new Color3(0.2, 0.8, 0.2);
    capsule.material = material;

    this.mesh.setMesh(capsule);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.CAPSULE,
      mass: 1,
      restitution: 0,
      friction: 0.5,
      collisionProfile: CollisionPreset.Actor,
    });

    // Lock rotation so player stays upright
    this.physics.lockRotation();

    // Camera arm follows player mesh (not attached - independent in hierarchy)
    this.cameraArm.setTarget(this.mesh);

    // Attach camera to arm
    this.camera.attachTo(this.cameraArm);
    this.camera.createDefaultCamera(scene);
    this.camera.setAsActiveCamera();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Game-specific input methods (called by controller)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sets movement input. Called by controller each frame.
   */
  setMoveInput(input: Vector2): void {
    this._moveInput = input;
  }

  /**
   * Sets look input. Called by controller each frame.
   */
  setLookInput(input: Vector2): void {
    this._lookInput = input;
  }

  /**
   * Triggers jump action. Called by controller.
   */
  jump(): void {
    this._pendingJump = true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tick - process intent
  // ─────────────────────────────────────────────────────────────────────────────

  protected override onTick(_deltaTime: number): void {
    // Look input rotates the camera arm
    this.cameraArm.addYaw(this._lookInput.x);
    this.cameraArm.addPitch(this._lookInput.y);

    // Movement relative to camera direction
    const forward = this.cameraArm.forward;
    const right = this.cameraArm.right;

    const velocity = this.physics.getLinearVelocity();
    velocity.x = (forward.x * this._moveInput.y + right.x * this._moveInput.x) * this._moveSpeed;
    velocity.z = (forward.z * this._moveInput.y + right.z * this._moveInput.x) * this._moveSpeed;

    // Process jump
    if (this._pendingJump) {
      this._pendingJump = false;
      velocity.y = this._jumpForce;
    }

    this.physics.setLinearVelocity(velocity);
  }
}

// ============================================================
// Input Actions and Context
// ============================================================

/**
 * Creates the OnFoot input context with keyboard, mouse, and gamepad bindings.
 * All devices work simultaneously - no mode switching needed.
 */
function createOnFootContext(): InputContext {
  // Move action (WASD + left stick)
  const moveAction: InputAction = {
    name: "Move",
    valueType: InputValueType.Axis2D,
    bindings: [
      // Keyboard WASD
      {
        type: "axis2d",
        xPositive: { device: InputDevice.Keyboard, code: "KeyD" },
        xNegative: { device: InputDevice.Keyboard, code: "KeyA" },
        yPositive: { device: InputDevice.Keyboard, code: "KeyW" },
        yNegative: { device: InputDevice.Keyboard, code: "KeyS" },
        modifiers: { normalize2D: true },
      },
      // Arrow keys
      {
        type: "axis2d",
        xPositive: { device: InputDevice.Keyboard, code: "ArrowRight" },
        xNegative: { device: InputDevice.Keyboard, code: "ArrowLeft" },
        yPositive: { device: InputDevice.Keyboard, code: "ArrowUp" },
        yNegative: { device: InputDevice.Keyboard, code: "ArrowDown" },
        modifiers: { normalize2D: true },
      },
      // Gamepad left stick
      {
        type: "axis2d",
        source2d: {
          x: { device: InputDevice.GamepadAxis, index: 0 },
          y: { device: InputDevice.GamepadAxis, index: 1 },
        },
        modifiers: { deadzone: 0.15, invertY: true },
      },
    ],
  };

  // Look action (gamepad right stick only - mouse handled separately)
  const lookAction: InputAction = {
    name: "Look",
    valueType: InputValueType.Axis2D,
    bindings: [
      {
        type: "axis2d",
        source2d: {
          x: { device: InputDevice.GamepadAxis, index: 2 },
          y: { device: InputDevice.GamepadAxis, index: 3 },
        },
        modifiers: { deadzone: 0.15, sensitivity: 0.1 },
      },
    ],
  };

  // CameraRotate action (RMB to enable mouse look)
  const cameraRotateAction: InputAction = {
    name: "CameraRotate",
    valueType: InputValueType.Button,
    bindings: [
      {
        type: "button",
        sources: [
          { device: InputDevice.MouseButton, button: 2 }, // Right mouse button
        ],
      },
    ],
  };

  // Jump action (Space + A button)
  const jumpAction: InputAction = {
    name: "Jump",
    valueType: InputValueType.Button,
    bindings: [
      {
        type: "button",
        sources: [
          { device: InputDevice.Keyboard, code: "Space" },
          { device: InputDevice.GamepadButton, index: 0 }, // A button
        ],
      },
    ],
  };

  // Primary action (LMB + E + Right trigger)
  const primaryAction: InputAction = {
    name: "Primary",
    valueType: InputValueType.Button,
    bindings: [
      {
        type: "button",
        sources: [
          { device: InputDevice.MouseButton, button: 0 },
          { device: InputDevice.Keyboard, code: "KeyE" },
          { device: InputDevice.GamepadButton, index: 7 }, // RT
        ],
      },
    ],
  };

  // Secondary action (Q + Left trigger)
  const secondaryAction: InputAction = {
    name: "Secondary",
    valueType: InputValueType.Button,
    bindings: [
      {
        type: "button",
        sources: [
          { device: InputDevice.Keyboard, code: "KeyQ" },
          { device: InputDevice.GamepadButton, index: 6 }, // LT
        ],
      },
    ],
  };

  return {
    name: "OnFoot",
    priority: 0,
    actions: [moveAction, lookAction, cameraRotateAction, jumpAction, primaryAction, secondaryAction],
    consumeInput: true,
  };
}

/**
 * Player controller using the action-based InputSystem.
 * Keyboard+mouse and gamepad work simultaneously - no mode cycling needed.
 * VR requires explicit session management via XRAdapter.
 */
export class TestPlayerController extends PlayerController {
  private _context: InputContext = createOnFootContext();
  private _mouseSensitivity: number = 0.002;

  protected override onActivate(): void {
    super.onActivate();
    this.inputSystem?.enableContext(this._context);
  }

  protected override onDeactivate(): void {
    this.inputSystem?.disableContext(this._context.name);
    super.onDeactivate();
  }

  override update(_deltaTime: number): void {
    // Type guard - this controller expects a PlayerPawn
    if (!(this.pawn instanceof PlayerPawn) || !this.inputSystem) return;
    const pawn = this.pawn;

    // Movement (keyboard + gamepad work together)
    const move = this.inputSystem.getAxis2D("Move");

    // Look: mouse (when RMB held) + gamepad right stick
    const cameraRotateHeld = this.inputSystem.getButton("CameraRotate");
    const mouseDelta = this.inputSystem.getMouseDelta();
    const gamepadLook = this.inputSystem.getAxis2D("Look");

    let look: Vector2;
    if (cameraRotateHeld && (mouseDelta.x !== 0 || mouseDelta.y !== 0)) {
      // Mouse: scale raw pixel delta (only when RMB held)
      look = new Vector2(
        mouseDelta.x * this._mouseSensitivity,
        mouseDelta.y * this._mouseSensitivity
      );
    } else {
      // Gamepad: always active, already scaled by binding modifiers
      look = gamepadLook;
    }

    // Apply to pawn
    pawn.setMoveInput(move);
    pawn.setLookInput(look);

    // Actions (edge-detected)
    if (this.inputSystem.wasButtonPressed("Jump")) {
      pawn.jump();
    }
    // Primary/Secondary actions available via input system if needed:
    // if (this.inputSystem.wasButtonPressed("Primary")) { ... }
  }
}
