import { Color3, type Scene, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { Actor, CollisionPreset, MeshComponent, PhysicsComponent, PhysicsShapeType } from "edenmark";

/**
 * Collectible coin - gives points when touched.
 */
export class Collectible extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  readonly points: number;
  private _collected = false;

  constructor(points: number = 10) {
    super();
    this.points = points;
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
    this.tickEnabled = true;
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const coin = MeshBuilder.CreateCylinder(`Coin_${this.id}`, {
      height: 0.1,
      diameter: 0.8,
    }, scene);
    coin.rotation.x = Math.PI / 2;

    const mat = new StandardMaterial(`CoinMat_${this.id}`, scene);
    mat.diffuseColor = new Color3(1, 0.85, 0);
    mat.emissiveColor = new Color3(0.3, 0.25, 0);
    coin.material = mat;
    this.mesh.setMesh(coin);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.CYLINDER,
      mass: 0,
      collisionProfile: CollisionPreset.Trigger,
    });
  }

  protected override onTick(deltaTime: number): void {
    // Spin the coin
    if (this.mesh.mesh) {
      this.mesh.mesh.rotation.z += deltaTime * 3;
    }
  }

  collect(): void {
    if (this._collected) return;
    this._collected = true;
    this.destroy();
  }
}

/**
 * Hazard zone - deals damage when touched.
 */
export class HazardZone extends Actor {
  mesh = new MeshComponent();
  physics = new PhysicsComponent();

  readonly damage: number;

  constructor(damage: number = 25) {
    super();
    this.damage = damage;
    this.addComponent(this.mesh);
    this.setRootComponent(this.mesh);
    this.addComponent(this.physics);
  }

  protected override onRegisterWithScene(scene: Scene): void {
    const box = MeshBuilder.CreateBox(`Hazard_${this.id}`, { size: 2 }, scene);
    const mat = new StandardMaterial(`HazardMat_${this.id}`, scene);
    mat.diffuseColor = new Color3(0.9, 0.1, 0.1);
    mat.alpha = 0.5;
    box.material = mat;
    this.mesh.setMesh(box);

    this.physics.attachTo(this.mesh, {
      shapeType: PhysicsShapeType.BOX,
      mass: 0,
      collisionProfile: CollisionPreset.Trigger,
    });
  }
}

