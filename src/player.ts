import * as THREE from 'three'
import { buildAnimal, animateAnimal, type AnimalRig } from './cat'
import { Input } from './input'
import { resolveCollisions, type Circle } from './colliders'

const MOVE_SPEED = 4.4
const ACCEL = 26
const GRAVITY = 26
const JUMP_VELOCITY = 9.4
const PLAYER_RADIUS = 0.38

export class Player {
  readonly rig: AnimalRig
  readonly position = new THREE.Vector3(0, 0, 9.2)
  readonly velocity = new THREE.Vector3()
  private vy = 0
  private grounded = true
  private facing = Math.PI // yaw, radians
  private walkPhase = 0
  private squash = 0 // spring value for squash & stretch
  private squashVel = 0
  private touchTarget: THREE.Vector3 | null = null
  private lastTargetDist = Infinity
  private stuckFor = 0
  private jumpBuffer = 0

  constructor() {
    this.rig = buildAnimal('kitten')
    this.rig.group.position.copy(this.position)
    this.rig.group.rotation.y = this.facing
  }

  /** Instantly move (e.g. into/out of a shop interior) and settle on the ground. */
  teleport(x: number, y: number, z: number, facing?: number): void {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.vy = 0
    this.grounded = true
    this.touchTarget = null
    if (facing !== undefined) this.facing = facing
    this.rig.group.position.copy(this.position)
    this.rig.group.rotation.y = this.facing
  }

  getFacing(): number {
    return this.facing
  }

  setFacing(y: number): void {
    this.facing = y
    this.rig.group.rotation.y = y
  }

  /** Walk to a world point (tap-to-move). Null clears it. */
  setMoveTarget(v: THREE.Vector3 | null): void {
    this.touchTarget = v ? v.clone() : null
    this.lastTargetDist = Infinity
    this.stuckFor = 0
  }

  /** Queue a jump (on-screen button). Buffers briefly so it feels instant. */
  requestJump(): void {
    this.jumpBuffer = 0.15
  }

  update(
    dt: number,
    input: Input,
    cameraYaw: number,
    colliders: Circle[],
    islandRadius: number,
    groundAt: (x: number, z: number) => number,
  ): void {
    // --- input → world direction (relative to camera yaw) ---
    const axis = input.moveAxis()
    if (axis.x !== 0 || axis.y !== 0) this.touchTarget = null // keyboard takes over

    let targetVx = 0
    let targetVz = 0
    if (this.touchTarget) {
      // tap-to-move: steer toward the world point
      const dx = this.touchTarget.x - this.position.x
      const dz = this.touchTarget.z - this.position.z
      const d = Math.hypot(dx, dz)
      if (d < 0.22) {
        this.touchTarget = null
      } else {
        if (d + 0.06 > this.lastTargetDist) {
          this.stuckFor += dt
          if (this.stuckFor > 1.1) {
            this.touchTarget = null // blocked — give up
            this.stuckFor = 0
          }
        } else {
          this.stuckFor = 0
          this.lastTargetDist = d
        }
        targetVx = (dx / d) * MOVE_SPEED
        targetVz = (dz / d) * MOVE_SPEED
      }
    } else {
      const cos = Math.cos(cameraYaw)
      const sin = Math.sin(cameraYaw)
      // screen up (-Z world at yaw 0); rotate by camera yaw
      targetVx = axis.x * cos + axis.y * sin
      targetVz = -axis.y * cos + axis.x * sin
    }

    // smooth acceleration toward target velocity
    const accel = ACCEL * dt
    this.velocity.x = THREE.MathUtils.clamp(
      this.velocity.x + THREE.MathUtils.clamp(targetVx - this.velocity.x, -accel, accel),
      -MOVE_SPEED,
      MOVE_SPEED,
    )
    this.velocity.z = THREE.MathUtils.clamp(
      this.velocity.z + THREE.MathUtils.clamp(targetVz - this.velocity.z, -accel, accel),
      -MOVE_SPEED,
      MOVE_SPEED,
    )

    // --- move & collide (axis-separated so we slide along obstacles;
    //     low obstacles are skipped while our feet are above them mid-jump) ---
    this.position.x += this.velocity.x * dt
    let solved = resolveCollisions(this.position.x, this.position.z, this.position.y, PLAYER_RADIUS, colliders, islandRadius)
    this.position.x = solved.x
    this.position.z = solved.z
    this.position.z += this.velocity.z * dt
    solved = resolveCollisions(this.position.x, this.position.z, this.position.y, PLAYER_RADIUS, colliders, islandRadius)
    this.position.x = solved.x
    this.position.z = solved.z

    // --- jump & gravity, following the terrain height under our new position ---
    const ground = groundAt(this.position.x, this.position.z)
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    if (this.grounded && (input.pressed('Space') || this.jumpBuffer > 0)) {
      this.jumpBuffer = 0
      this.vy = JUMP_VELOCITY
      this.grounded = false
      this.squashVel += 5.5 // stretch!
    }
    if (this.grounded) {
      const dy = ground - this.position.y
      if (dy > 0.02) {
        // climb up onto grass terraces, quickly but smoothly
        this.position.y += Math.max(dy * 12 * dt, 2.2 * dt)
        if (this.position.y > ground) this.position.y = ground
      } else if (dy < -0.02) {
        if (dy < -0.5) {
          // walked off a ledge → become airborne
          this.grounded = false
          this.vy = 0
        } else {
          // walk down gentle slopes
          this.position.y += dy * Math.min(1, 14 * dt)
        }
      }
    } else {
      this.vy -= GRAVITY * dt
      this.position.y += this.vy * dt
      if (this.position.y <= ground && this.vy <= 0) {
        this.position.y = ground
        this.grounded = true
        if (this.vy < -3) this.squashVel -= Math.min(9, -this.vy * 1.1) // landing squash
        this.vy = 0
      }
    }

    // --- facing ---
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (speed > 0.35) {
      const targetFacing = Math.atan2(this.velocity.x, this.velocity.z)
      let delta = targetFacing - this.facing
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      this.facing += delta * Math.min(1, dt * 12)
    }

    // --- animation ---
    const walkAmount = THREE.MathUtils.clamp(speed / MOVE_SPEED, 0, 1)
    this.walkPhase += dt * (6 + walkAmount * 8) * (walkAmount > 0.02 ? 1 : 0)
    animateAnimal(this.rig, this.clock(dt), walkAmount, this.walkPhase)

    // squash & stretch spring
    this.squashVel += -this.squash * 90 * dt // stiffness
    this.squashVel *= Math.exp(-dt * 9) // damping
    this.squash += this.squashVel * dt
    this.squash = THREE.MathUtils.clamp(this.squash, -0.45, 0.45)
    const sq = this.squash
    this.rig.body.scale.set(1 - sq * 0.45, 1 + sq, 1 - sq * 0.45)

    // lean into movement a touch
    this.rig.group.rotation.z = THREE.MathUtils.lerp(this.rig.group.rotation.z, -walkAmount * 0.05, dt * 8)

    // blob shadow sticks to the ground under the kitten, fades with jump height
    const h = this.position.y - ground
    this.rig.blob.position.y = ground + 0.02 - this.position.y
    this.rig.blob.scale.setScalar(THREE.MathUtils.clamp(1 - h * 0.18, 0.5, 1))
    ;(this.rig.blob.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.16 - h * 0.03, 0.04, 0.16)

    this.rig.group.position.copy(this.position)
    this.rig.group.rotation.y = this.facing
  }

  private time = 0
  private clock(dt: number): number {
    this.time += dt
    return this.time
  }
}
