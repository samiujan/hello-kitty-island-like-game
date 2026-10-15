import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { matte, glossy } from './palette'

const BODY = '#a9e3b4'
const BELLY = '#fdf6e3'
const SPIKE = '#79c489'
const INK = '#4a3b32'
const BLUSH = '#ffb6c8'

/** Beyond this the kitten has clearly teleported (shop door, jet ski) — hop over. */
const SNAP_DIST = 4
/** How far behind the kitten Sprout likes to waddle. */
const FOLLOW_DIST = 1.35
/** A touch faster than the kitten's 4.4 u/s so it never falls behind. */
const MAX_SPEED = 7.6

/**
 * Sprout — the baby dino that hatches from the museum egg. Waddles after the
 * kitten, hops when hurrying, and looks up when idle.
 */
export class Companion {
  readonly group = new THREE.Group()
  private t = 0
  private facing = 0
  private moving = false

  constructor() {
    this.group.add(buildSprout())
    this.group.visible = false
  }

  /** Place Sprout beside the kitten (after a teleport or scene change). */
  snapTo(p: THREE.Vector3): void {
    this.group.position.set(p.x + 1.1, p.y, p.z + 1.1)
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    groundAt: (x: number, z: number) => number,
    visible: boolean,
  ): void {
    this.group.visible = visible
    if (!visible) return

    this.t += dt
    const g = this.group
    let dx = g.position.x - playerPos.x
    let dz = g.position.z - playerPos.z
    let d = Math.hypot(dx, dz)

    if (d > SNAP_DIST) {
      this.snapTo(playerPos)
      dx = g.position.x - playerPos.x
      dz = g.position.z - playerPos.z
      d = Math.hypot(dx, dz)
    }

    this.moving = d > FOLLOW_DIST
    if (this.moving && d > 1e-4) {
      const step = Math.min(MAX_SPEED * dt, d - FOLLOW_DIST)
      g.position.x -= (dx / d) * step
      g.position.z -= (dz / d) * step
      // face where we are heading
      this.turnTo(Math.atan2(-dx, -dz), dt * 9)
    } else {
      // idle: look up at the kitten
      this.turnTo(Math.atan2(playerPos.x - g.position.x, playerPos.z - g.position.z), dt * 3)
    }
    g.rotation.y = this.facing

    const hop = this.moving ? Math.abs(Math.sin(this.t * 11)) * 0.16 : Math.sin(this.t * 2.4) * 0.03
    g.position.y = groundAt(g.position.x, g.position.z) + hop

    // squash & stretch around the feet
    const sq = hop * 1.6
    g.scale.set(1 + sq * 0.22, 1 - sq * 0.28, 1 + sq * 0.22)
    g.rotation.z = this.moving ? Math.sin(this.t * 11) * 0.05 : 0
  }

  private turnTo(target: number, rate: number): void {
    let delta = target - this.facing
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    this.facing += delta * Math.min(1, rate)
  }
}

/** A chibi baby dino, root at the feet, facing +Z. */
function buildSprout(): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = matte(BODY)

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    g.add(m)
    return m
  }

  // body + pale tummy
  const body = mesh(new THREE.SphereGeometry(0.26, 20, 16), bodyMat, 0, 0.3, 0)
  body.scale.set(1, 0.92, 1.15)
  const belly = mesh(new THREE.SphereGeometry(0.19, 16, 12), matte(BELLY), 0, 0.27, 0.11)
  belly.scale.set(0.9, 0.85, 0.72)

  // head + snout
  mesh(new THREE.SphereGeometry(0.21, 20, 16), bodyMat, 0, 0.6, 0.15)
  const snout = mesh(new RoundedBoxGeometry(0.18, 0.13, 0.17, 3, 0.04), matte(BELLY), 0, 0.55, 0.31)
  snout.castShadow = false

  // eyes with sparkles, plus blush
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.052, 12, 12), glossy(INK), side * 0.08, 0.63, 0.31)
    mesh(new THREE.SphereGeometry(0.019, 8, 8), glossy('#ffffff'), side * 0.08 + 0.016, 0.652, 0.352)
    const blush = mesh(new THREE.SphereGeometry(0.045, 10, 8), matte(BLUSH), side * 0.15, 0.55, 0.26)
    blush.scale.set(1, 0.6, 0.4)
    blush.castShadow = false
  }

  // little back spikes
  for (let i = 0; i < 3; i++) {
    mesh(new THREE.ConeGeometry(0.05, 0.12, 8), matte(SPIKE), 0, 0.47 - i * 0.1, -0.07 - i * 0.13)
  }

  // tail
  const tail = mesh(new THREE.ConeGeometry(0.1, 0.34, 10), bodyMat, 0, 0.3, -0.33)
  tail.rotation.x = -1.9

  // stubby legs
  for (const [lx, lz] of [[-0.13, 0.1], [0.13, 0.1], [-0.13, -0.12], [0.13, -0.12]] as [number, number][]) {
    const leg = mesh(new THREE.SphereGeometry(0.075, 10, 8), bodyMat, lx, 0.07, lz)
    leg.scale.set(1, 1.1, 1.2)
  }

  return g
}
