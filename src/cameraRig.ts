import * as THREE from 'three'

/**
 * High-angle three-quarter camera that reads nearly isometric,
 * like the reference screenshot. Smoothly follows the player with
 * a little look-ahead in the movement direction.
 *
 * Pressing T toggles "tilt mode": a low, cinematic angle where the
 * horizon sits around 30% of the screen and the sky fills the top.
 */
export class CameraRig {
  readonly yaw: number
  private pitchVillage: number
  private distVillage: number
  private pitchTilt: number
  private distTilt: number
  private pitchIndoor: number
  private distIndoor: number
  private pitch: number
  private dist: number
  private tilted = false // start on the steep, playable camera; T tilts down
  private indoor = false
  private currentTarget = new THREE.Vector3()
  private offset = new THREE.Vector3()

  constructor(
    private camera: THREE.PerspectiveCamera,
    opts: {
      yaw?: number
      pitch?: number
      dist?: number
      fov?: number
      tiltPitch?: number
      tiltDist?: number
      indoorPitch?: number
      indoorDist?: number
    } = {},
  ) {
    this.yaw = opts.yaw ?? THREE.MathUtils.degToRad(16)
    this.pitchVillage = opts.pitch ?? THREE.MathUtils.degToRad(53)
    this.distVillage = opts.dist ?? 15
    // low angle: horizon lands at ~30% of the screen (fov 42° → half 21°; 8.5° pitch)
    this.pitchTilt = opts.tiltPitch ?? THREE.MathUtils.degToRad(8.5)
    this.distTilt = opts.tiltDist ?? 34
    // indoors: top-down enough to see the whole room, close enough to feel cozy
    this.pitchIndoor = opts.indoorPitch ?? THREE.MathUtils.degToRad(56)
    this.distIndoor = opts.indoorDist ?? 7.5
    // start at the active mode's pose so there's no swing-in on load
    this.pitch = this.tilted ? this.pitchTilt : this.pitchVillage
    this.dist = this.tilted ? this.distTilt : this.distVillage
    camera.fov = opts.fov ?? 34
    camera.updateProjectionMatrix()
    this.recomputeOffset()
  }

  get tilt(): boolean {
    return this.tilted
  }

  toggleTilt(): void {
    this.tilted = !this.tilted
  }

  setIndoor(indoor: boolean): void {
    this.indoor = indoor
  }

  private recomputeOffset(): void {
    const horizontal = Math.cos(this.pitch) * this.dist
    this.offset.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch) * this.dist,
      Math.cos(this.yaw) * horizontal,
    )
  }

  update(dt: number, targetPos: THREE.Vector3, velocity: THREE.Vector3): void {
    // ease pitch/distance toward the active mode
    const basePitch = this.indoor ? this.pitchIndoor : this.pitchVillage
    const baseDist = this.indoor ? this.distIndoor : this.distVillage
    const targetPitch = this.tilted ? this.pitchTilt : basePitch
    const targetDist = this.tilted ? this.distTilt : baseDist
    const k = 1 - Math.exp(-dt * 3.4)
    this.pitch += (targetPitch - this.pitch) * k
    this.dist += (targetDist - this.dist) * k
    this.recomputeOffset()

    // look-ahead: shift focus slightly toward where we're heading
    const lead = new THREE.Vector3(velocity.x, 0, velocity.z).multiplyScalar(this.tilted ? 0.45 : 0.28)
    const desired = targetPos.clone().add(lead).add(new THREE.Vector3(0, 0.75, 0))

    // frame-rate independent exponential smoothing
    const t = 1 - Math.exp(-dt * 5.5)
    this.currentTarget.lerp(desired, t)

    this.camera.position.copy(this.currentTarget).add(this.offset)
    this.camera.lookAt(this.currentTarget)
  }
}
