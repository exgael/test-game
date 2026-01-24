import {
  Pawn,
  PlayerController,
  MeshComponent,
  PhysicsComponent,
  PhysicsShapeType,
  CameraComponent,
  CameraArmComponent,
  type InputAdapter,
  type InputState,
} from "edenmark";
import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  type Scene,
  KeyboardEventTypes,
  type KeyboardInfo,
} from "@babylonjs/core";

/**
 * Player pawn - a controllable capsule with physics.
 */
export class PlayerPawn extends Pawn {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();
  cameraArm = new CameraArmComponent({ distance: 8, heightOffset: 2 });
  camera = new CameraComponent();

  private _moveSpeed: number = 5;
  private _jumpForce: number = 5;
  private _lookSensitivity: number = 0.002;

  constructor() {
    super();
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
    this.addComponent(this.cameraArm);
    this.addComponent(this.camera);
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
    });

    // Lock rotation so player stays upright
    this.physics.lockRotation();

    // Setup camera arm attached to player mesh
    this.cameraArm.attachTo(this.mesh);

    // Attach camera to arm
    this.camera.attachTo(this.cameraArm);
    this.camera.createDefaultCamera(scene);
    this.camera.setAsActiveCamera();
  }

  protected override executeMovement(
    move: { x: number; y: number },
    look: { x: number; y: number },
    _deltaTime: number
  ): void {
    // Look input rotates the camera arm (arm auto-updates in PostPhysics tick)
    this.cameraArm.addYaw(look.x * this._lookSensitivity);
    this.cameraArm.addPitch(look.y * this._lookSensitivity);

    // Movement relative to camera direction
    const forward = this.cameraArm.forward;
    const right = this.cameraArm.right;

    const velocity = this.physics.getLinearVelocity();
    velocity.x = (forward.x * move.y + right.x * move.x) * this._moveSpeed;
    velocity.z = (forward.z * move.y + right.z * move.x) * this._moveSpeed;
    this.physics.setLinearVelocity(velocity);
  }

  protected override onJump(): void {
    const velocity = this.physics.getLinearVelocity();
    velocity.y = this._jumpForce;
    this.physics.setLinearVelocity(velocity);
  }
}

/**
 * Input modes for the cycling controller.
 */
const InputMode = {
  Keyboard: "keyboard",
  Gamepad: "gamepad",
  VR: "vr",
} as const;

type InputMode = (typeof InputMode)[keyof typeof InputMode];

/**
 * Player controller that cycles between input modes.
 * Press P to cycle between keyboard, gamepad, and VR.
 * Press V to enter VR mode (when in VR input mode).
 */
export class CyclingPlayerController extends PlayerController {
  private _inputMode: InputMode = InputMode.Keyboard;
  private _keyboardAdapter: InputAdapter | null = null;
  private _gamepadAdapter: InputAdapter | null = null;
  private _xrAdapter: InputAdapter | null = null;

  get inputMode(): InputMode {
    return this._inputMode;
  }

  protected override onActivate(): void {
    super.onActivate();

    const world = this.world;
    if (!world) return;

    // Create all adapters
    this._keyboardAdapter = world.input.createKeyboardMouse();
    this._gamepadAdapter = world.input.createGamepad();
    this._xrAdapter = world.input.createXR();

    // Start with keyboard
    this.setInputAdapter(this._keyboardAdapter);

    // Listen for P key to cycle modes
    const scene = world.scene;
    if (scene) {
      scene.onKeyboardObservable.add((kbInfo: KeyboardInfo) => {
        if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
          if (kbInfo.event.key.toLowerCase() === "p") {
            this.cycleInputMode();
          } else if (kbInfo.event.key.toLowerCase() === "v") {
            if (this._inputMode === InputMode.VR) {
              this.enterVR();
            }
          }
        }
      });
    }

    console.log(`Input mode: ${this._inputMode}`);
  }

  cycleInputMode(): void {
    const modes = [InputMode.Keyboard, InputMode.Gamepad, InputMode.VR];
    const currentIndex = modes.indexOf(this._inputMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this._inputMode = modes[nextIndex];

    // Switch adapter
    switch (this._inputMode) {
      case InputMode.Keyboard:
        if (this._keyboardAdapter) {
          this.setInputAdapter(this._keyboardAdapter);
        }
        break;
      case InputMode.Gamepad:
        if (this._gamepadAdapter) {
          this.setInputAdapter(this._gamepadAdapter);
        }
        break;
      case InputMode.VR:
        if (this._xrAdapter) {
          this.setInputAdapter(this._xrAdapter);
        }
        break;
    }

    console.log(`Input mode: ${this._inputMode}`);
  }

  async enterVR(): Promise<void> {
    if (this._xrAdapter && "enterXR" in this._xrAdapter) {
      const success = await (
        this._xrAdapter as InputAdapter & { enterXR: () => Promise<boolean> }
      ).enterXR();
      if (success) {
        console.log("Entered VR mode");
      } else {
        console.log("Failed to enter VR mode");
      }
    }
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);

    // Get input and apply to pawn
    const input: InputState = this.lastInput;
    const pawn = this.pawn;

    if (pawn) {
      pawn.setMoveInput(input.move);
      pawn.setLookInput(input.look);

      if (input.jump) {
        pawn.jump();
      }
    }
  }
}
