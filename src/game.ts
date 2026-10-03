import * as THREE from 'three'
import { PAL } from './palette'
import { Input } from './input'
import { CameraRig } from './cameraRig'
import { Player } from './player'
import { buildNPCs, animateNPCs, type NPC } from './npcs'
import { animateAnimal } from './cat'
import { buildWorld, animateWorld, groundHeightAt, ISLAND_RADIUS, type World } from './world'
import { updateFading } from './fading'
import { Dialogue } from './dialogue'
import { buildInteriors, type Interior } from './interiors'
import { buildJetSki, JETSKI_PARKED, BEACH_SPOT, WATER_Y, RIDE_MIN_R, RIDE_MAX_R } from './beach'

const TALK_RANGE = 2.3
const ENTER_RANGE = 2.6

interface DoorTrigger {
  name: string
  x: number
  z: number
  range: number
  kind: 'interior' | 'jetski' | 'ride'
  interior?: Interior
  ride?: 'merry' | 'swing' | 'slide' | 'bars'
}

type RideKind = NonNullable<DoorTrigger['ride']>

interface Activity {
  kind: RideKind
  t: number
  dur: number
  savedPos: THREE.Vector3
}

interface JetskiState {
  vel: number
  heading: number
  pos: THREE.Vector3
}

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private cameraRig: CameraRig
  private input = new Input()
  readonly player = new Player()
  readonly npcs: NPC[]
  private world: World
  private dialogue: Dialogue
  private clock = new THREE.Clock()
  private sun: THREE.DirectionalLight
  private interiors: { iceCream: Interior; barber: Interior; slushie: Interior; museum: Interior }
  private mode: 'village' | Interior = 'village'
  private savedOutside = new THREE.Vector3()
  private doors: DoorTrigger[]
  private doorHint: HTMLDivElement
  private doorHintUntil = 0
  private doorHintAction: (() => void) | null = null
  private tmpV = new THREE.Vector3()
  private tmpV2 = new THREE.Vector3()
  private raycaster = new THREE.Raycaster()
  private tapStart: { x: number; y: number; t: number } | null = null
  private pendingDoor: DoorTrigger | null = null
  private pendingTalk: NPC | null = null
  private jetski: THREE.Group
  private jetskiState: JetskiState | null = null
  private activity: Activity | null = null

  constructor(container: HTMLElement) {
    // --- renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    // --- camera ---
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 320)
    this.cameraRig = new CameraRig(this.camera, {
      yaw: THREE.MathUtils.degToRad(14),
      pitch: THREE.MathUtils.degToRad(50),
      dist: 18.5,
      tiltPitch: THREE.MathUtils.degToRad(10),
      tiltDist: 11,
      indoorPitch: THREE.MathUtils.degToRad(58),
      indoorDist: 10.5,
    })

    // --- atmosphere ---
    this.scene.background = new THREE.Color(PAL.sky)
    this.scene.fog = new THREE.Fog(PAL.sky, 48, 100)

    // --- lighting: bright & soft for the white world ---
    const hemi = new THREE.HemisphereLight('#f4f9ff', '#dfe8f4', 1.35)
    this.scene.add(hemi)

    this.sun = new THREE.DirectionalLight('#ffe7c4', 2.2)
    this.sun.position.set(-14, 22, 10)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -30
    this.sun.shadow.camera.right = 30
    this.sun.shadow.camera.top = 30
    this.sun.shadow.camera.bottom = -30
    this.sun.shadow.camera.near = 4
    this.sun.shadow.camera.far = 75
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.05
    this.sun.shadow.radius = 4
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    // faint warm bounce from the other side so shadows aren't flat
    const fill = new THREE.DirectionalLight('#ffd9e6', 0.5)
    fill.position.set(12, 8, -14)
    this.scene.add(fill)

    // --- world & actors ---
    this.world = buildWorld()
    this.scene.add(this.world.group)
    this.scene.add(this.player.rig.group)
    this.npcs = buildNPCs()
    for (const npc of this.npcs) {
      npc.groundH = this.groundAt(npc.position.x, npc.position.z)
      npc.rig.group.position.y = npc.groundH
      this.scene.add(npc.rig.group)
    }

    this.dialogue = new Dialogue(document.getElementById('hud')!)

    // interiors + interactables (doors, jet ski, playground rides)
    this.interiors = buildInteriors()
    for (const i of [this.interiors.iceCream, this.interiors.barber, this.interiors.slushie, this.interiors.museum]) {
      this.scene.add(i.group)
    }
    this.jetski = buildJetSki()
    this.jetski.position.copy(JETSKI_PARKED)
    this.jetski.rotation.y = Math.PI / 2
    this.scene.add(this.jetski)

    this.doors = [
      { name: 'enter the Ice Cream Shop', x: -6.18 * 1.28, z: -4.11 * 1.28, range: ENTER_RANGE, kind: 'interior', interior: this.interiors.iceCream },
      { name: 'enter the Barber Shop', x: 0.665 * 1.28, z: 0.649 * 1.28, range: ENTER_RANGE, kind: 'interior', interior: this.interiors.barber },
      { name: 'enter the Slushie Shop', x: 8.94 * 1.28, z: -3.06 * 1.28, range: ENTER_RANGE, kind: 'interior', interior: this.interiors.slushie },
      { name: 'enter the Museum', x: 0, z: -12.4 * 1.28, range: ENTER_RANGE, kind: 'interior', interior: this.interiors.museum },
      { name: 'ride the jet ski', x: JETSKI_PARKED.x, z: JETSKI_PARKED.z, range: 4.2, kind: 'jetski' },
      { name: 'ride the merry-go-round', x: -16.1 * 1.28, z: 11.2 * 1.28, range: 4.2, kind: 'ride', ride: 'merry' },
      { name: 'sit on the swing', x: -12.6 * 1.28, z: 13.7 * 1.28, range: 3.4, kind: 'ride', ride: 'swing' },
      { name: 'ride the slide', x: -14.5 * 1.28, z: 14.7 * 1.28, range: 4.2, kind: 'ride', ride: 'slide' },
      { name: 'cross the monkey bars', x: -11.1 * 1.28, z: 10.4 * 1.28, range: 3.6, kind: 'ride', ride: 'bars' },
    ]
    this.doorHint = document.createElement('div')
    this.doorHint.className = 'bubble hint'
    this.doorHint.style.display = 'none'
    this.doorHint.addEventListener('click', () => this.doorHintAction?.())
    document.getElementById('hud')!.appendChild(this.doorHint)

    // on-screen jump button (tablets)
    document.getElementById('jump-btn')?.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.player.requestJump()
    })

    // touch / mouse: tap to walk, tap doors & animals to interact
    container.addEventListener('pointerdown', (e) => {
      this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }
    })
    container.addEventListener('pointerup', (e) => {
      const s = this.tapStart
      this.tapStart = null
      if (!s) return
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y)
      if (moved > 14 || performance.now() - s.t > 600) return
      this.handleTap(e.clientX, e.clientY)
    })

    window.addEventListener('resize', () => this.onResize())

    this.renderer.setAnimationLoop(() => this.tick())
  }

  private groundAt(x: number, z: number): number {
    if (this.mode !== 'village') return 0 // interiors have flat floors
    return groundHeightAt(x, z, this.world.bumps)
  }

  private enterInterior(door: DoorTrigger): void {
    const i = door.interior!
    this.savedOutside.copy(this.player.position)
    this.world.group.visible = false
    this.jetski.visible = false
    for (const npc of this.npcs) npc.rig.group.visible = false
    i.group.visible = true
    this.player.teleport(i.spawn.x, i.spawn.y, i.spawn.z, i.spawnFacing)
    this.mode = i
    this.cameraRig.setIndoor(true)
    this.dialogue.hide()
    this.doorHintUntil = performance.now() + 4500
  }

  private exitInterior(): void {
    const i = this.mode as Interior
    i.group.visible = false
    this.world.group.visible = true
    this.jetski.visible = true
    for (const npc of this.npcs) npc.rig.group.visible = true
    this.player.teleport(this.savedOutside.x, this.savedOutside.y, this.savedOutside.z)
    this.mode = 'village'
    this.cameraRig.setIndoor(false)
    this.dialogue.hide()
    this.doorHint.style.display = 'none'
  }

  // --- jet ski ---

  private mountJetski(): void {
    this.savedOutside.copy(this.player.position)
    this.jetskiState = { vel: 0, heading: Math.PI / 2, pos: JETSKI_PARKED.clone() }
    this.player.rig.blob.visible = false
    this.dialogue.hide()
  }

  private dismountJetski(): void {
    this.jetskiState = null
    this.jetski.position.copy(JETSKI_PARKED)
    this.jetski.rotation.set(0, Math.PI / 2, 0)
    this.player.rig.blob.visible = true
    const gy = this.groundAt(BEACH_SPOT.x, BEACH_SPOT.z)
    this.player.teleport(BEACH_SPOT.x, gy, BEACH_SPOT.z, Math.PI / 2)
    this.dialogue.hide()
  }

  private tickJetski(dt: number, t: number): void {
    const js = this.jetskiState!
    const axis = this.input.moveAxis()
    js.vel += axis.y * 16 * dt
    js.vel = THREE.MathUtils.clamp(js.vel, -5, 15)
    js.vel *= Math.exp(-0.5 * dt)
    js.heading -= axis.x * 1.6 * dt * (js.vel >= 0 ? 1 : -1)

    js.pos.x += Math.sin(js.heading) * js.vel * dt
    js.pos.z += Math.cos(js.heading) * js.vel * dt
    const r = Math.hypot(js.pos.x, js.pos.z)
    if (r > RIDE_MAX_R) {
      js.pos.multiplyScalar(RIDE_MAX_R / r)
      js.vel *= 0.4
    } else if (r < RIDE_MIN_R) {
      js.pos.multiplyScalar(RIDE_MIN_R / r)
      js.vel *= 0.3
    }

    const turn = -axis.x
    this.jetski.position.set(js.pos.x, WATER_Y + Math.sin(t * 2.8) * 0.07, js.pos.z)
    this.jetski.rotation.y = js.heading
    this.jetski.rotation.z = THREE.MathUtils.lerp(this.jetski.rotation.z, turn * Math.min(1, Math.abs(js.vel) / 8) * 0.35, dt * 4)

    // kitten rides on the seat
    const rig = this.player.rig
    rig.group.position.set(js.pos.x, WATER_Y + 0.42, js.pos.z)
    rig.group.rotation.y = js.heading
    animateAnimal(rig, t, 0, 0)
    rig.blob.position.y = -0.4
    ;(rig.blob.material as THREE.MeshBasicMaterial).opacity = 0.1

    this.player.position.copy(this.jetski.position) // camera + shadows follow
  }

  // --- playground rides ---

  private startRide(door: DoorTrigger): void {
    const kind = door.ride!
    const pg = this.world.playground
    const a: Activity = { kind, t: 0, dur: kind === 'slide' ? 1.6 : kind === 'bars' ? 2.6 : Infinity, savedPos: this.player.position.clone() }
    this.activity = a
    if (kind === 'slide') {
      this.player.teleport(0, 0, 0)
    }
    void pg
  }

  private endRide(): void {
    const a = this.activity!
    const pg = this.world.playground
    let exit: THREE.Vector3
    if (a.kind === 'merry') exit = pg.merry.localToWorld(this.tmpV.set(0, -0.2, 2.4))
    else if (a.kind === 'swing') exit = pg.swingPivots[0].parent!.localToWorld(this.tmpV.set(-0.65, 0, 1.6))
    else if (a.kind === 'slide') exit = pg.slide.localToWorld(this.tmpV.copy(pg.slideExit))
    else exit = pg.bars.localToWorld(this.tmpV.set(1.9, 0, 0.8))
    const gy = this.groundAt(exit.x, exit.z)
    this.player.teleport(exit.x, gy, exit.z, this.player.rig.group.rotation.y)
    this.activity = null
    this.player.rig.blob.visible = true
  }

  private tickRide(dt: number, t: number): void {
    const a = this.activity!
    a.t += dt
    const pg = this.world.playground
    const rig = this.player.rig
    rig.group.position.copy(this.player.position)
    rig.group.rotation.y = this.player.rig.group.rotation.y

    if (a.kind === 'merry') {
      const v = pg.merry.localToWorld(this.tmpV.set(1.0, 0.82, 0))
      rig.group.position.copy(v)
      const worldAngle = pg.merry.rotation.y
      rig.group.rotation.y = worldAngle + Math.PI / 2
    } else if (a.kind === 'swing') {
      const v = pg.swingPivots[0].localToWorld(this.tmpV.set(0, -1.55, 0))
      rig.group.position.copy(v)
      rig.group.rotation.y = pg.swingPivots[0].parent!.rotation.y
      rig.body.rotation.x = pg.swingPivots[0].rotation.z * 0.6
    } else if (a.kind === 'slide') {
      const p = a.t / a.dur
      if (p < 0.25) {
        const q = p / 0.25
        const from = a.savedPos
        const top = pg.slide.localToWorld(this.tmpV.copy(pg.slideTop))
        rig.group.position.lerpVectors(from, top, q)
        rig.group.rotation.y = pg.slide.rotation.y + Math.PI
      } else if (p < 0.78) {
        const q = (p - 0.25) / 0.53
        const top = pg.slide.localToWorld(this.tmpV.copy(pg.slideTop))
        const bottom = pg.slide.localToWorld(this.tmpV2.copy(pg.slideBottom))
        rig.group.position.lerpVectors(top, bottom, q)
        rig.group.rotation.y = pg.slide.rotation.y + Math.PI
        rig.body.rotation.x = 0.45 // sitting pose on the way down
      } else if (p < 1) {
        const q = (p - 0.78) / 0.22
        const bottom = pg.slide.localToWorld(this.tmpV.copy(pg.slideBottom))
        const exit = pg.slide.localToWorld(this.tmpV2.copy(pg.slideExit))
        rig.group.position.lerpVectors(bottom, exit, q)
        rig.body.rotation.x = 0
      } else {
        this.endRide()
        return
      }
    } else if (a.kind === 'bars') {
      const p = Math.min(1, a.t / a.dur)
      const from = pg.bars.localToWorld(this.tmpV.copy(pg.barsFrom))
      const to = pg.bars.localToWorld(this.tmpV2.copy(pg.barsTo))
      rig.group.position.lerpVectors(from, to, p)
      rig.group.position.y = from.y + Math.abs(Math.sin(a.t * 5)) * -0.12 + 0.06
      rig.group.rotation.y = -pg.bars.rotation.y + Math.PI
      rig.body.rotation.x = 0.25 // hanging
      if (p >= 1) {
        this.endRide()
        return
      }
    }
    animateAnimal(rig, t, 0, 0)
    const gy = this.groundAt(rig.group.position.x, rig.group.position.z)
    rig.blob.position.y = gy + 0.02 - rig.group.position.y
    ;(rig.blob.material as THREE.MeshBasicMaterial).opacity = 0.1
  }

  /** A tap: walk toward what was tapped, and interact on arrival. */
  private handleTap(px: number, py: number): void {
    if (this.jetskiState || this.activity) return // hint bubble handles dismount/hop-off
    const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)

    if (this.mode === 'village') {
      // tapping an animal walks over and talks — mesh raycast first, then a
      // forgiving screen-radius check so small chibi bodies are easy to hit
      const hits = this.raycaster.intersectObjects(this.npcs.map((n) => n.rig.group), true)
      let tappedNpc: NPC | null = null
      if (hits.length) {
        let root: THREE.Object3D | null = hits[0].object
        while (root && !this.npcs.some((n) => n.rig.group === root)) root = root.parent
        tappedNpc = this.npcs.find((n) => n.rig.group === root) ?? null
      }
      if (!tappedNpc) {
        let bestNpcDist = 52
        for (const n of this.npcs) {
          this.tmpV.copy(n.rig.group.position)
          this.tmpV.y += 0.7
          this.tmpV.project(this.camera)
          if (this.tmpV.z > 1) continue
          const sx = (this.tmpV.x * 0.5 + 0.5) * window.innerWidth
          const sy = (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight
          const dist = Math.hypot(sx - px, sy - py)
          if (dist < bestNpcDist) {
            bestNpcDist = dist
            tappedNpc = n
          }
        }
      }
      if (tappedNpc) {
        this.pendingTalk = tappedNpc
        this.pendingDoor = null
        const target = tappedNpc.rig.group.position.clone()
        target.y = 0
        this.player.setMoveTarget(target)
        return
      }

      // tapping near a door / ride / jet ski label walks over and triggers it
      let best: DoorTrigger | null = null
      let bestDist = 60
      for (const d of this.doors) {
        this.tmpV.set(d.x, 1.2, d.z).project(this.camera)
        if (this.tmpV.z > 1) continue
        const sx = (this.tmpV.x * 0.5 + 0.5) * window.innerWidth
        const sy = (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight
        const dist = Math.hypot(sx - px, sy - py)
        if (dist < bestDist) {
          bestDist = dist
          best = d
        }
      }
      if (best) {
        this.pendingDoor = best
        this.pendingTalk = null
        this.player.setMoveTarget(new THREE.Vector3(best.x, 0, best.z))
        return
      }

      // otherwise: walk onto the ground point
      const dir = this.raycaster.ray.direction
      if (dir.y < -0.05) {
        const t = -this.raycaster.ray.origin.y / dir.y
        const p = this.raycaster.ray.origin.clone().addScaledVector(dir, t)
        const r = Math.hypot(p.x, p.z)
        const maxR = ISLAND_RADIUS - 0.3
        if (r > maxR) p.multiplyScalar(maxR / r)
        p.y = 0
        this.pendingDoor = null
        this.pendingTalk = null
        this.player.setMoveTarget(p)
      }
      return
    }

    // inside an interior: tap the door to leave, or the floor to walk
    const i = this.mode as Interior
    this.tmpV.copy(i.doorAnchor).project(this.camera)
    if (this.tmpV.z <= 1) {
      const sx = (this.tmpV.x * 0.5 + 0.5) * window.innerWidth
      const sy = (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight
      if (Math.hypot(sx - px, sy - py) < 64) {
        this.exitInterior()
        return
      }
    }
    const dir = this.raycaster.ray.direction
    if (dir.y < -0.05) {
      const t = -this.raycaster.ray.origin.y / dir.y
      const p = this.raycaster.ray.origin.clone().addScaledVector(dir, t)
      p.x = THREE.MathUtils.clamp(p.x, -4.2, 4.2)
      p.z = THREE.MathUtils.clamp(p.z, -3.3, 3.3)
      p.y = 0
      this.player.setMoveTarget(p)
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime

    const indoors = this.mode !== 'village'
    const busy = indoors || this.jetskiState !== null || this.activity !== null

    // route the kitten by mode
    if (this.jetskiState) {
      this.tickJetski(dt, t)
    } else if (this.activity) {
      this.tickRide(dt, t)
    } else {
      const colliders = indoors ? (this.mode as Interior).colliders : this.world.colliders
      this.player.update(dt, this.input, this.cameraRig.yaw, colliders, indoors ? 9999 : ISLAND_RADIUS, (x, z) =>
        this.groundAt(x, z),
      )
    }

    animateNPCs(this.npcs, t, this.player.position)
    animateWorld(this.world, t)
    if (!indoors && !this.jetskiState) updateFading(this.camera, this.player.position, this.world.fadeables, dt)

    // keep the shadow camera centered on the player so shadows stay crisp
    this.sun.position.set(this.player.position.x - 14, 22, this.player.position.z + 10)
    this.sun.target.position.copy(this.player.position)
    this.sun.target.updateMatrixWorld()

    // camera view toggle
    if (this.input.pressed('KeyT')) this.cameraRig.toggleTilt()

    // enter / exit / interact
    if (this.input.pressed('KeyI')) {
      if (this.jetskiState) {
        this.dismountJetski()
      } else if (this.activity) {
        if (this.activity.kind === 'merry' || this.activity.kind === 'swing') this.endRide()
      } else if (indoors) {
        this.exitInterior()
      } else {
        const door = this.nearestInteractable()
        if (door) this.triggerDoor(door)
      }
    }

    // resolve tap-driven interactions once the kitten arrives
    const axisMoving = this.input.moveAxis()
    const keyboardMoved = axisMoving.x !== 0 || axisMoving.y !== 0
    if (keyboardMoved) {
      this.pendingDoor = null
      this.pendingTalk = null
    }

    // recompute: the I-press above may have switched scenes this very frame
    const indoorsNow = this.mode !== 'village'

    if (!indoorsNow && !this.jetskiState && !this.activity) {
      if (this.pendingDoor) {
        const d = this.pendingDoor
        if (Math.hypot(this.player.position.x - d.x, this.player.position.z - d.z) < d.range) {
          this.pendingDoor = null
          this.triggerDoor(d)
        }
      }
      if (this.pendingTalk) {
        const npc = this.pendingTalk
        if (npc.rig.group.position.distanceTo(this.player.position) < TALK_RANGE) {
          this.pendingTalk = null
          this.dialogue.talk(npc)
        }
      }
    }

    // hide whichever interior walls sit between the camera and the room
    if (indoorsNow) {
      for (const w of (this.mode as Interior).walls) {
        this.tmpV.copy(this.camera.position).sub(w.center)
        w.group.visible = this.tmpV.dot(w.normal) < 0
      }
    }

    // interaction hint bubble
    this.updateDoorHint(indoorsNow, busy)

    // talking only happens in the village while idle
    if (!indoorsNow && !this.jetskiState && !this.activity) {
      let nearest: NPC | null = null
      let nearestDist = Infinity
      for (const npc of this.npcs) {
        const d = npc.rig.group.position.distanceTo(this.player.position)
        if (d < nearestDist) {
          nearestDist = d
          nearest = npc
        }
      }
      if (nearest && nearestDist < TALK_RANGE && this.input.pressed('KeyE')) {
        this.dialogue.talk(nearest)
      }
      this.dialogue.update(this.camera, this.npcs, this.player.position)
    }

    this.cameraRig.update(dt, this.player.position, this.player.velocity)

    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()
  }

  private nearestInteractable(): DoorTrigger | null {
    let door: DoorTrigger | null = null
    let doorDist = Infinity
    for (const d of this.doors) {
      const dist = Math.hypot(this.player.position.x - d.x, this.player.position.z - d.z)
      if (dist < doorDist) {
        doorDist = dist
        door = d
      }
    }
    return door && doorDist < door.range ? door : null
  }

  private triggerDoor(door: DoorTrigger): void {
    this.player.setMoveTarget(null)
    this.pendingDoor = null
    this.pendingTalk = null
    if (door.kind === 'interior') this.enterInterior(door)
    else if (door.kind === 'jetski') this.mountJetski()
    else this.startRide(door)
  }

  private setHint(html: string | null, action: (() => void) | null, anchor?: THREE.Vector3): void {
    if (html === null) {
      this.doorHint.style.display = 'none'
      this.doorHintAction = null
      this.doorHint.classList.remove('tappable')
      return
    }
    this.doorHint.innerHTML = html
    this.doorHintAction = action
    if (action) this.doorHint.classList.add('tappable')
    else this.doorHint.classList.remove('tappable')
    if (anchor) this.placeHint(this.doorHint, anchor)
    this.doorHint.style.display = 'block'
  }

  private updateDoorHint(indoors: boolean, busy: boolean): void {
    const now = performance.now()
    if (this.jetskiState) {
      this.setHint(
        '<span class="text">tap / press <b>I</b> to hop off at the beach</span>',
        () => this.dismountJetski(),
        this.tmpV.copy(this.player.position).add(new THREE.Vector3(0, 1.9, 0)),
      )
      return
    }
    if (this.activity) {
      if (this.activity.kind === 'merry' || this.activity.kind === 'swing') {
        this.setHint(
          '<span class="text">tap / press <b>I</b> to hop off</span>',
          () => this.endRide(),
          this.tmpV.copy(this.player.position).add(new THREE.Vector3(0, 1.9, 0)),
        )
      } else {
        this.setHint(null, null)
      }
      return
    }
    if (indoors) {
      const i = this.mode as Interior
      const nearDoor = this.player.position.distanceTo(i.doorAnchor) < 3.2
      if (nearDoor || now < this.doorHintUntil) {
        this.setHint('<span class="text">tap / press <b>I</b> to step outside</span>', () => this.exitInterior(), i.doorAnchor)
      } else {
        this.setHint(null, null)
      }
      return
    }
    void busy
    // village: hint when near an interactable
    const door = this.nearestInteractable()
    if (door) {
      this.setHint(
        `<span class="text">tap / press <b>I</b> to ${door.name}</span>`,
        () => this.triggerDoor(door),
        new THREE.Vector3(door.x, 1.9, door.z),
      )
    } else {
      this.setHint(null, null)
    }
  }

  private placeHint(el: HTMLElement, worldPos: THREE.Vector3): void {
    const pos = worldPos.clone().project(this.camera)
    if (pos.z > 1) {
      el.style.display = 'none'
      return
    }
    el.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`
    el.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`
  }
}
