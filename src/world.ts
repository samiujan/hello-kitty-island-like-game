import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PAL, matte, jitterColor } from './palette'
import { prepareFadeable, type Fadeable } from './fading'
import { buildFarm, type FarmAnimal } from './farm'
import type { Circle } from './colliders'

/** A large prop registered for camera-occlusion fading. */
interface FadeProp {
  group: THREE.Group
  center: THREE.Vector3 // local (pre-scale) coords
  radius: number
}

export interface Playground {
  merry: THREE.Group // spins via animateWorld
  /** Local-space anchor of the bench the kitten rides on. */
  merrySeat: { angle: number; radius: number; y: number }
  swingPivots: THREE.Group[]
  slide: THREE.Group
  slideTop: THREE.Vector3
  slideBottom: THREE.Vector3
  slideExit: THREE.Vector3
  bars: THREE.Group
  barsFrom: THREE.Vector3
  barsTo: THREE.Vector3
}

/** The village is authored at this scale, then widened: geometry, colliders and
 *  terrain heights all scale together so surfaces stay consistent. */
export const WORLD_SCALE = 1.28

/** Pre-scale radius of the island disc. The rim props, the lagoon ring and the
 *  jet-ski bounds all derive from this, so growing the island keeps the shore
 *  coherent instead of leaving props stranded inland. */
const ISLAND_R = 26

export const ISLAND_RADIUS = (ISLAND_R - 1.2) * WORLD_SCALE // playable bound

/** A walkable terrain bump: a spherical grass terrace or a flat plateau (plaza). */
export interface Bump {
  x: number
  z: number
  r: number
  h: number
  flat?: boolean
}

/**
 * Sample the walkable ground height at (x, z): the tallest terrace or plateau
 * covering that point, or 0 on the sand. Characters walk over these.
 */
export function groundHeightAt(x: number, z: number, bumps: Bump[]): number {
  let h = 0
  for (const b of bumps) {
    const dx = x - b.x
    const dz = z - b.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < b.r) {
      let hh: number
      if (b.flat) {
        // plateau with a short smooth skirt so stepping up isn't a hard snap
        const t = THREE.MathUtils.clamp((b.r - d) / 0.45, 0, 1)
        hh = b.h * t * t * (3 - 2 * t)
      } else {
        hh = b.h * Math.sqrt(1 - (d * d) / (b.r * b.r))
      }
      if (hh > h) h = hh
    }
  }
  return h
}

export interface Butterfly {
  group: THREE.Group
  center: THREE.Vector3
  radius: number
  speed: number
  phase: number
  height: number
  wings: [THREE.Object3D, THREE.Object3D]
}

export interface World {
  group: THREE.Group
  colliders: Circle[]
  bumps: Bump[]
  butterflies: Butterfly[]
  flames: THREE.Mesh[]
  skyClouds: THREE.Group
  fadeables: Fadeable[]
  spinners: THREE.Mesh[]
  playground: Playground
  farm: FarmAnimal[]
}

/** Deterministic RNG so the village layout is stable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260915)
const rr = (min: number, max: number) => min + rand() * (max - min)

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Gradient sky dome + big soft Ghibli-style clouds that slowly drift. */
function buildSky(g: THREE.Group, rand2: () => number): THREE.Group {
  // gradient dome (soft blue up top, warm cream/peach at the horizon)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      cTop: { value: new THREE.Color(PAL.skyTop) },
      cMid: { value: new THREE.Color(PAL.skyMid) },
      cBottom: { value: new THREE.Color(PAL.skyLow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      uniform vec3 cTop;
      uniform vec3 cMid;
      uniform vec3 cBottom;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.16
          ? mix(cMid, cTop, smoothstep(0.16, 0.72, h))
          : mix(cBottom, cMid, smoothstep(-0.2, 0.16, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 20), skyMat)
  g.add(dome)

  // big fluffy clouds — rounded puffs, flattened bottoms, cream white
  const drift = new THREE.Group()
  const cloudMat = matte('#fffdf6', { roughness: 1, emissive: '#fff6ea', emissiveIntensity: 0.35 })
  ;(cloudMat as THREE.MeshStandardMaterial).fog = false

  const cumulus = (cx: number, cy: number, cz: number, s: number, elong = 1.4): void => {
    const cloud = new THREE.Group()
    cloud.position.set(cx, cy, cz)
    const puffs = 5 + Math.floor(rand2() * 3)
    for (let i = 0; i < puffs; i++) {
      const r = (0.55 + rand2() * 0.65) * s
      const px = (i - (puffs - 1) / 2) * 0.62 * s * elong
      const py = rand2() * 0.35 * s
      const pz = (rand2() - 0.5) * 0.8 * s
      const puff = mesh(new THREE.SphereGeometry(r, 16, 12), cloudMat, px, py, pz)
      puff.scale.set(elong, 0.62, 1)
      puff.castShadow = false
      puff.receiveShadow = false
      cloud.add(puff)
    }
    drift.add(cloud)
  }

  // ring of tall cumulus around the island
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand2() * 0.5
    const d = 42 + rand2() * 48
    cumulus(Math.cos(a) * d, 15 + rand2() * 12, Math.sin(a) * d, 2.6 + rand2() * 2.2)
  }
  // a few flat, far clouds hugging the horizon
  for (let i = 0; i < 5; i++) {
    const a = rand2() * Math.PI * 2
    const d = 95 + rand2() * 35
    cumulus(Math.cos(a) * d, 5 + rand2() * 5, Math.sin(a) * d, 3.2 + rand2() * 2.4, 3.2)
  }
  g.add(drift)
  return drift
}

/** Redraw canvas textures once the rounded web font finishes loading. */
const fontRedraws: (() => void)[] = []
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready
    .then(() => {
      for (const fn of fontRedraws) fn()
    })
    .catch(() => {})
}

/** Rounded-rect canvas label (transparent bg) used on signposts. */
function makeLabelTexture(text: string, fg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 340
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const draw = () => {
    ctx.clearRect(0, 0, 340, 96)
    ctx.font = '700 46px "Baloo 2", system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(90, 55, 35, 0.55)'
    ctx.strokeText(text, 170, 54)
    ctx.fillStyle = fg
    ctx.fillText(text, 170, 54)
    tex.needsUpdate = true
  }
  draw()
  fontRedraws.push(draw)
  return tex
}

/** Rounded shop-sign board texture with border and centered label. */
function makeBoardTexture(text: string, bg: string, border: string, fg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const draw = () => {
    ctx.clearRect(0, 0, 512, 200)
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(10, 10, 492, 180, 46)
    ctx.fill()
    ctx.lineWidth = 12
    ctx.strokeStyle = border
    ctx.beginPath()
    ctx.roundRect(10, 10, 492, 180, 46)
    ctx.stroke()
    ctx.fillStyle = fg
    ctx.font = '800 62px "Baloo 2", system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 106)
    tex.needsUpdate = true
  }
  draw()
  fontRedraws.push(draw)
  return tex
}

/** Diagonal red/white stripes for the barber pole. */
function makeStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff6ec'
  ctx.fillRect(0, 0, 64, 64)
  ctx.strokeStyle = '#e05a6d'
  ctx.lineWidth = 15
  for (let i = -2; i < 5; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 32 - 32, 72)
    ctx.lineTo(i * 32 + 32, -8)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeCheckerTexture(a: string, b: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const n = 4
  const cell = canvas.width / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  return tex
}

// ---------------------------------------------------------------- terrain

function buildTerrain(g: THREE.Group, colliders: Circle[], bumps: Bump[]): void {
  // pastel sea below the floating island
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    matte(PAL.water, { roughness: 0.35 }),
  )
  sea.rotation.x = -Math.PI / 2
  sea.position.y = -8.6
  g.add(sea)
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_R - 0.5, ISLAND_R + 5, 64),
    matte('#e6f5fc', { roughness: 0.5 }),
  )
  foam.rotation.x = -Math.PI / 2
  foam.position.y = -8.5
  g.add(foam)

  // main island body
  const island = mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.4, 2.6, 64), matte(PAL.sand), 0, -1.3, 0)
  island.castShadow = false
  g.add(island)

  // rounded dirt skirt below (floating-diorama feel)
  const skirt = mesh(new THREE.CylinderGeometry(ISLAND_R - 0.6, 8, 4.4, 48), matte(PAL.dirt), 0, -4.6, 0)
  skirt.castShadow = false
  g.add(skirt)
  // rounded bottom tip — must stay fully BELOW the island (top edge < -2.6)
  const tip = mesh(new THREE.SphereGeometry(8, 32, 16), matte(PAL.dirt), 0, -6.8, 0)
  tip.scale.set(1, 0.45, 1)
  tip.castShadow = false
  g.add(tip)

  // grass terraces — raised, walkable bumps (the groundHeightAt sampler must match these shapes)
  const patches: [number, number, number][] = [
    [-6.5, -11, 4.6], [7, -9.5, 4.2], [11.5, 2, 4.4], [-12, -1.5, 4.4], [9, 8, 4.6],
    [-6.6, 9.4, 3.5], [3.5, -13.5, 3.6], [-3, 14, 3.4], [14.5, -5.5, 3.4], [-15, 6, 3.4],
    [13.5, 7.5, 2.9], [-13.5, -8, 3.0], [0.5, 12.5, 2.6], [-16.5, -3.5, 2.6], [17, 1.5, 2.5],
  ]
  for (const [x, z, r] of patches) {
    const blob = mesh(new THREE.SphereGeometry(r, 30, 20), matte(rand() > 0.5 ? PAL.grass : PAL.grassDeep), x, 0.02, z)
    blob.scale.set(1.05, 0.16, 1.05)
    blob.castShadow = false
    g.add(blob)
    bumps.push({ x, z, r: r * 1.05, h: 0.02 + r * 0.16 })

    // a lighter mound on top of some terraces
    if (rand() > 0.45) {
      const tr = r * 0.55
      const tx = x + rr(-0.5, 0.5)
      const tz = z + rr(-0.5, 0.5)
      const tuft = mesh(new THREE.SphereGeometry(tr, 20, 14), matte(PAL.grassLight), tx, 0.1, tz)
      tuft.scale.set(1.05, 0.14, 1)
      tuft.castShadow = false
      g.add(tuft)
      bumps.push({ x: tx, z: tz, r: tr * 1.02, h: 0.1 + tr * 0.14 })
    }
  }

  // grass tufts (tiny cones)
  const bladeMat = matte(PAL.leafDeep)
  for (let i = 0; i < 42; i++) {
    const a = rand() * Math.PI * 2
    const d = rand() * 19
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const tuft = new THREE.Group()
    for (let b = 0; b < 3; b++) {
      const blade = mesh(new THREE.ConeGeometry(0.055, rr(0.18, 0.3), 5), bladeMat, (b - 1) * 0.07, 0.1, 0)
      blade.rotation.z = (b - 1) * 0.35
      tuft.add(blade)
    }
    tuft.position.set(x, groundHeightAt(x, z, bumps), z)
    tuft.rotation.y = rand() * Math.PI
    g.add(tuft)
  }

  // edge rocks poking out of the rim — solid, with colliders
  const rimSpots: [number, number][] = [
    [5, -25], [12, -22], [-4, 25], [-19, -16], [23, 9.5], [-24, 8], [19, -14], [-13, 21.5],
  ]
  for (const [x, z] of rimSpots) {
    const size = rr(0.8, 1.5)
    const rock = mesh(new THREE.IcosahedronGeometry(size, 1), matte(rand() > 0.5 ? PAL.rock : PAL.rockDark), x, 0.15, z)
    rock.scale.set(1.25, 0.55, 1)
    rock.rotation.y = rand() * Math.PI
    g.add(rock)
    // small rocks are hop-able; big boulders always block
    if (size < 1.15) colliders.push({ x, z, r: size * 1.05, h: 0.62 })
    else colliders.push({ x, z, r: size * 1.15 })
  }
}

// ---------------------------------------------------------------- paths

function buildPlankPath(g: THREE.Group, colliders: Circle[], from: THREE.Vector2, to: THREE.Vector2, width = 1.7): void {
  const dir = to.clone().sub(from)
  const len = dir.length()
  dir.normalize()
  const angle = Math.atan2(dir.x, dir.y)
  const plankCount = Math.floor(len / 0.82)
  for (let i = 0; i <= plankCount; i++) {
    const t = i / plankCount
    const p = from.clone().lerp(to, t)
    const base = rand() > 0.5 ? PAL.plank : PAL.plankDark
    const mat = matte('#000000').clone()
    mat.color = jitterColor(base, 0.05)
    const plank = mesh(new RoundedBoxGeometry(width, 0.1, 0.62, 3, 0.05), mat, p.x, 0.04, p.y)
    plank.rotation.y = angle + rr(-0.03, 0.03)
    g.add(plank)

    // log edging on both sides — low obstacles you bump into (and can hop over)
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const logMat = matte('#000000').clone()
        logMat.color = jitterColor(PAL.log, 0.06)
        const logX = p.x + dir.y * side * (width / 2 + 0.22)
        const logZ = p.y - dir.x * side * (width / 2 + 0.22)
        const log = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12), logMat, logX, 0.12, logZ)
        log.rotation.z = Math.PI / 2
        log.rotation.y = angle
        g.add(log)
        colliders.push({ x: logX, z: logZ, r: 0.26, h: 0.3 })
      }
    }
  }
}

function buildPlaza(g: THREE.Group, colliders: Circle[], bumps: Bump[], cx: number, cz: number): void {
  const PLAZA_H = 0.22

  // raised stone plinth — a flat, walkable plateau
  const plinth = mesh(new THREE.CylinderGeometry(5.0, 5.15, 0.4, 48), matte(PAL.stone), cx, PLAZA_H / 2 - 0.15, cz)
  plinth.receiveShadow = true
  g.add(plinth)
  bumps.push({ x: cx, z: cz, r: 5.0, h: PLAZA_H, flat: true })

  // wooden ring border — low kerb, walkable
  const ringMat = matte(PAL.log)
  const segments = 18
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = cx + Math.cos(a) * 4.55
    const z = cz + Math.sin(a) * 4.55
    const seg = mesh(new RoundedBoxGeometry(1.0, 0.12, 0.55, 3, 0.05), ringMat, x, PLAZA_H + 0.0, z)
    seg.rotation.y = -a + Math.PI / 2
    g.add(seg)
  }

  // pink cobblestones: center + two rings — laid flush with the plinth top
  const stone = (x: number, z: number, r: number) => {
    const mat = matte('#000000').clone()
    mat.color = jitterColor(rand() > 0.5 ? PAL.stone : PAL.stoneDark, 0.045)
    const s = mesh(new THREE.CylinderGeometry(r, r * 0.94, 0.06, 18), mat, x, PLAZA_H - 0.01, z)
    g.add(s)
  }
  stone(cx, cz, 0.95)
  for (let ring = 0; ring < 2; ring++) {
    const count = 7 + ring * 7
    const radius = 1.85 + ring * 1.35
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.35
      stone(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius, rr(0.5, 0.62))
    }
  }

  // plaza torches (just outside the plinth, on the sand)
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
    buildTorch(g, colliders, cx + dx * 5.35, cz + dz * 5.35)
  }
}

function buildTorch(g: THREE.Group, colliders: Circle[], x: number, z: number): void {
  const pole = mesh(new THREE.CylinderGeometry(0.075, 0.1, 1.25, 10), matte(PAL.logDark), x, 0.62, z)
  g.add(pole)
  const bowl = mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.18, 12), matte(PAL.rockDark), x, 1.3, z)
  g.add(bowl)
  const flame = mesh(new THREE.SphereGeometry(0.16, 12, 12), matte('#ffb347', { emissive: '#ff9d2e', emissiveIntensity: 1.6, roughness: 0.5 }), x, 1.47, z)
  flame.scale.y = 1.5
  flame.castShadow = false
  g.add(flame)
  flames.push(flame)
  colliders.push({ x, z, r: 0.24 })
}

// ---------------------------------------------------------------- plants

/** Distinct silhouettes, so directions can name something a child can spot. */
type TreeKind = 'round' | 'blossom' | 'pine' | 'palm'

function buildTree(
  g: THREE.Group,
  colliders: Circle[],
  fade: FadeProp[],
  x: number,
  z: number,
  s: number,
  kind: TreeKind = 'round',
): void {
  const tree = new THREE.Group()
  tree.position.set(x, 0, z)

  if (kind === 'pine') {
    // tall conifer — deliberately the tallest thing around, so "the tall pine"
    // is a landmark you can point at from anywhere
    tree.add(mesh(new THREE.CylinderGeometry(0.22 * s, 0.36 * s, 1.3 * s, 10), matte(PAL.logDark), 0, 0.65 * s, 0))
    const tiers = 4
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1)
      const cone = mesh(
        new THREE.ConeGeometry((1.35 - t * 0.8) * s, (1.7 - t * 0.35) * s, 14),
        matte(i % 2 === 0 ? PAL.grassDeep : PAL.leafDeep),
        0,
        (1.2 + i * 0.9) * s,
        0,
      )
      tree.add(cone)
    }
    g.add(tree)
    colliders.push({ x, z, r: 0.52 * s + 0.25 })
    fade.push({ group: tree, center: new THREE.Vector3(x, 2.6 * s, z), radius: 1.55 * s })
    return
  }

  if (kind === 'palm') {
    const trunk = mesh(new THREE.CylinderGeometry(0.15 * s, 0.24 * s, 3.3 * s, 10), matte('#c9a06a'), 0, 1.65 * s, 0)
    trunk.rotation.z = rr(-0.1, 0.1)
    tree.add(trunk)
    const frondMat = matte(PAL.leafDeep)
    for (let i = 0; i < 6; i++) {
      const arm = new THREE.Group()
      arm.position.y = 3.2 * s
      arm.rotation.y = (i / 6) * Math.PI * 2
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.24 * s, 2.2 * s, 6), frondMat)
      frond.rotation.z = -Math.PI / 2 + 0.62 // droop, rather than a flat starburst
      frond.scale.set(1, 1, 0.42) // flatten the cone into a leaf blade
      frond.position.set(0.85 * s, -0.12 * s, 0)
      frond.castShadow = true
      arm.add(frond)
      tree.add(arm)
    }
    tree.add(mesh(new THREE.SphereGeometry(0.3 * s, 12, 10), matte('#d9b070'), 0, 3.2 * s, 0))
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      tree.add(mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), matte('#8a6a44'), Math.cos(a) * 0.27 * s, 2.95 * s, Math.sin(a) * 0.27 * s))
    }
    g.add(tree)
    colliders.push({ x, z, r: 0.36 * s + 0.25 })
    fade.push({ group: tree, center: new THREE.Vector3(x, 2.3 * s, z), radius: 1.5 * s })
    return
  }

  const blossom = kind === 'blossom'
  const trunk = mesh(new THREE.CylinderGeometry(0.3 * s, 0.42 * s, 1.5 * s, 12), matte(PAL.log), 0, 0.75 * s, 0)
  tree.add(trunk)
  const roots = mesh(new THREE.SphereGeometry(0.62 * s, 14, 10), matte(PAL.logDark), 0, 0.1 * s, 0)
  roots.scale.y = 0.4
  tree.add(roots)

  const canopyColors = blossom ? [PAL.blossomPink, PAL.blossomPurple, '#f7c1d6'] : [PAL.grass, PAL.grassDeep, PAL.grassLight]
  const blobCount = blossom ? 4 : 5
  for (let i = 0; i < blobCount; i++) {
    const a = (i / blobCount) * Math.PI * 2 + rand()
    const r = rr(0.35, 0.75) * s
    const bx = Math.cos(a) * rr(0.2, 0.85) * s
    const bz = Math.sin(a) * rr(0.2, 0.85) * s
    const by = (1.75 + rr(-0.15, 0.4)) * s
    const blob = mesh(new THREE.SphereGeometry(r, 18, 14), matte(canopyColors[i % canopyColors.length]), bx, by, bz)
    tree.add(blob)
  }
  const topBlob = mesh(new THREE.SphereGeometry(0.95 * s, 18, 14), matte(canopyColors[0]), 0, 2.1 * s, 0)
  tree.add(topBlob)

  if (blossom) {
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2
      const d = rr(0.6, 1.3) * s
      const dot = mesh(new THREE.SphereGeometry(0.12 * s, 8, 8), matte(PAL.flowerWhite), Math.cos(a) * d, (1.9 + rr(-0.3, 0.4)) * s, Math.sin(a) * d)
      tree.add(dot)
    }
  }

  g.add(tree)
  colliders.push({ x, z, r: 0.62 * s + 0.25 })
  fade.push({ group: tree, center: new THREE.Vector3(x, 2.0 * s, z), radius: 1.45 * s })
}

function buildBush(g: THREE.Group, colliders: Circle[], x: number, z: number, s: number, flowery = true): void {
  const bush = new THREE.Group()
  bush.position.set(x, 0, z)
  const mat = matte(rand() > 0.5 ? PAL.grass : PAL.grassDeep)
  const b1 = mesh(new THREE.SphereGeometry(0.55 * s, 16, 12), mat, 0, 0.3 * s, 0)
  b1.scale.y = 0.85
  const b2 = mesh(new THREE.SphereGeometry(0.38 * s, 14, 10), mat, 0.42 * s, 0.22 * s, 0.1)
  b2.scale.y = 0.8
  const b3 = mesh(new THREE.SphereGeometry(0.34 * s, 14, 10), mat, -0.4 * s, 0.2 * s, -0.08)
  b3.scale.y = 0.8
  bush.add(b1, b2, b3)

  if (flowery) {
    const flowerColors = [PAL.blossomPink, PAL.blossomPurple, PAL.flowerYellow]
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const d = rr(0, 0.5) * s
      const f = mesh(
        new THREE.SphereGeometry(0.11 * s, 8, 8),
        matte(flowerColors[i % flowerColors.length]),
        Math.cos(a) * d,
        (0.45 + rr(0, 0.25)) * s,
        Math.sin(a) * d,
      )
      bush.add(f)
    }
  }
  g.add(bush)
  // low enough to hop over with a well-timed jump
  colliders.push({ x, z, r: 0.55 * s, h: 0.6 * s })
}

function buildFlower(g: THREE.Group, bumps: Bump[], x: number, z: number): void {
  const flower = new THREE.Group()
  flower.position.set(x, groundHeightAt(x, z, bumps), z)
  const stem = mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.34, 6), matte(PAL.leafDeep), 0, 0.17, 0)
  flower.add(stem)
  const color = [PAL.blossomPink, PAL.blossomPurple, PAL.flowerYellow, PAL.flowerWhite][Math.floor(rand() * 4)]
  const head = mesh(new THREE.SphereGeometry(0.1, 10, 8), matte(color), 0, 0.38, 0)
  flower.add(head)
  const center = mesh(new THREE.SphereGeometry(0.045, 8, 6), matte(PAL.flowerYellow), 0, 0.38, 0.07)
  flower.add(center)
  g.add(flower)
}

// ---------------------------------------------------------------- buildings

function heartGeometry(size: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  const x = 0
  const y = 0
  s.moveTo(x + 0.25, y + 0.25)
  s.bezierCurveTo(x + 0.25, y + 0.25, x + 0.2, y, x, y)
  s.bezierCurveTo(x - 0.3, y, x - 0.3, y + 0.35, x - 0.3, y + 0.35)
  s.bezierCurveTo(x - 0.3, y + 0.55, x - 0.15, y + 0.77, x + 0.25, y + 0.95)
  s.bezierCurveTo(x + 0.6, y + 0.77, x + 0.8, y + 0.55, x + 0.8, y + 0.35)
  s.bezierCurveTo(x + 0.8, y + 0.35, x + 0.8, y, x + 0.5, y)
  s.bezierCurveTo(x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 })
  geo.scale(size, size, size)
  geo.rotateZ(Math.PI) // point down
  geo.center()
  return geo
}

function buildHut(g: THREE.Group, colliders: Circle[], fade: FadeProp[], x: number, z: number, rotY: number): void {
  const hut = new THREE.Group()
  hut.position.set(x, 0, z)
  hut.rotation.y = rotY

  // platform (light wood porch)
  const platform = mesh(new THREE.CylinderGeometry(2.95, 3.1, 0.35, 26), matte(PAL.log), 0, 0.17, 0)
  hut.add(platform)

  // walls
  const walls = mesh(new RoundedBoxGeometry(3.5, 2.15, 3.0, 4, 0.35), matte(PAL.hutPink), 0, 1.4, 0)
  hut.add(walls)
  const wainscot = mesh(new RoundedBoxGeometry(3.56, 0.55, 3.06, 4, 0.2), matte(PAL.hutPurple), 0, 0.62, 0)
  hut.add(wainscot)

  // door (front = +Z)
  const door = mesh(new RoundedBoxGeometry(1.0, 1.5, 0.16, 3, 0.28), matte(PAL.hutPurple), 0, 1.05, 1.5)
  hut.add(door)
  const knob = mesh(new THREE.SphereGeometry(0.07, 10, 10), matte(PAL.flowerYellow, { roughness: 0.4 }), 0.32, 1.0, 1.6)
  hut.add(knob)

  // windows — the glass must sit proud of the wall face (z = 1.5) or it z-fights it
  for (const side of [-1, 1]) {
    const frame = mesh(new THREE.TorusGeometry(0.38, 0.075, 10, 22), matte(PAL.plankDark), side * 1.05, 1.6, 1.55)
    hut.add(frame)
    const glass = mesh(new THREE.CircleGeometry(0.36, 22), matte(PAL.white, { roughness: 0.3 }), side * 1.05, 1.6, 1.53)
    hut.add(glass)
    const bar = mesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), matte(PAL.plankDark), side * 1.05, 1.6, 1.57)
    hut.add(bar)
    const bar2 = mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), matte(PAL.plankDark), side * 1.05, 1.6, 1.57)
    hut.add(bar2)
  }

  // roof (chunky pyramid w/ generous overhang)
  const roof = mesh(new THREE.ConeGeometry(3.15, 1.7, 4, 1), matte(PAL.roof, { flat: true }), 0, 3.2, 0)
  roof.rotation.y = Math.PI / 4
  hut.add(roof)
  const roofTrim = mesh(new THREE.CylinderGeometry(2.32, 2.32, 0.22, 4, 1), matte('#fff6ec', { flat: true }), 0, 2.42, 0)
  roofTrim.rotation.y = Math.PI / 4
  hut.add(roofTrim)
  const finial = mesh(new THREE.SphereGeometry(0.19, 12, 10), matte(PAL.flowerYellow), 0, 4.1, 0)
  hut.add(finial)

  // scalloped awning over the door
  const awning = new THREE.Group()
  const slope = mesh(new RoundedBoxGeometry(1.7, 0.09, 0.85, 3, 0.04), matte(PAL.awning), 0, 2.05, 1.78)
  slope.rotation.x = 0.38
  awning.add(slope)
  for (let i = 0; i < 5; i++) {
    const scallop = mesh(new THREE.SphereGeometry(0.16, 10, 8), matte(PAL.awning), -0.64 + i * 0.32, 1.83, 2.08)
    scallop.scale.set(1, 0.75, 0.55)
    awning.add(scallop)
  }
  hut.add(awning)

  // heart sign beside the door
  const heart = mesh(heartGeometry(0.5), matte(PAL.blossomPink), 1.12, 1.85, 1.52)
  heart.rotation.z = Math.PI / 2 + Math.PI
  hut.add(heart)

  // potted plants by the door
  for (const side of [-1, 1]) {
    buildPot(hut, side * 1.9, 0.35, side * 1.35 + 1.2)
  }

  g.add(hut)
  colliders.push({ x, z, r: 3.25 })
  fade.push({ group: hut, center: new THREE.Vector3(x, 2.2, z), radius: 2.8 })
}

function buildPot(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const pot = new THREE.Group()
  pot.position.set(x, y, z)
  const body = mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.3, 12), matte('#cf7d54'), 0, 0.15, 0)
  pot.add(body)
  const rim = mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 14), matte('#e08c60'), 0, 0.3, 0)
  rim.rotation.x = Math.PI / 2
  pot.add(rim)
  const soil = mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 12), matte('#8a5a40'), 0, 0.32, 0)
  pot.add(soil)
  const succ = new THREE.Group()
  succ.position.y = 0.34
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const leafy = mesh(new THREE.SphereGeometry(0.09, 8, 8), matte(PAL.leafDeep), Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07)
    leafy.scale.set(1, 1.4, 1)
    leafy.rotation.z = Math.cos(a) * 0.5
    leafy.rotation.x = Math.sin(a) * -0.5
    succ.add(leafy)
  }
  succ.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), matte(PAL.grassLight), 0, 0.12, 0))
  pot.add(succ)
  parent.add(pot)
}

interface HouseColors {
  wall: string
  band: string
  roof: string
}

const HOUSE_BARBER: HouseColors = { wall: '#fbf9f4', band: '#7fb3d8', roof: '#dd6fc6' }
const HOUSE_SLUSHIE: HouseColors = { wall: '#e2f2fc', band: '#6f9fd8', roof: '#6f9fd8' }

/** The yellow museum — a grander cottage with a round skylight window. */
function buildMuseum(g: THREE.Group, colliders: Circle[], fade: FadeProp[], x: number, z: number, rotY: number): void {
  const m = new THREE.Group()
  m.position.set(x, groundHeightAtSafe(x, z), z)
  m.rotation.y = rotY

  const walls = mesh(new RoundedBoxGeometry(4.6, 2.6, 3.6, 4, 0.4), matte('#f7d774'), 0, 1.5, 0)
  m.add(walls)
  const band = mesh(new RoundedBoxGeometry(4.68, 0.5, 3.68, 3, 0.2), matte('#fff6d8'), 0, 0.35, 0)
  m.add(band)

  // wide pyramidal roof
  const roof = mesh(new THREE.ConeGeometry(3.9, 1.9, 4, 1), matte('#e0a952', { flat: true }), 0, 3.7, 0)
  roof.rotation.y = Math.PI / 4
  m.add(roof)
  const trim = mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.2, 4, 1), matte('#fff6ec', { flat: true }), 0, 2.78, 0)
  trim.rotation.y = Math.PI / 4
  m.add(trim)
  m.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), matte(PAL.flowerYellow), 0, 4.72, 0))

  // door + round windows
  const door = mesh(new RoundedBoxGeometry(1.1, 1.7, 0.16, 3, 0.3), matte('#b0803a'), 0, 1.05, 1.86)
  m.add(door)
  m.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), matte(PAL.flowerYellow, { roughness: 0.4 }), 0.36, 1.0, 1.96))
  for (const side of [-1, 1]) {
    m.add(mesh(new THREE.TorusGeometry(0.34, 0.09, 10, 20), matte('#fff6ec'), side * 1.5, 1.75, 1.84))
    m.add(mesh(new THREE.CircleGeometry(0.3, 20), matte('#cfe8f5', { roughness: 0.3 }), side * 1.5, 1.75, 1.83))
  }
  // round skylight up top
  m.add(mesh(new THREE.TorusGeometry(0.4, 0.09, 10, 20), matte('#fff6ec'), 0, 2.35, 1.84))
  m.add(mesh(new THREE.CircleGeometry(0.36, 20), matte('#cfe8f5', { roughness: 0.3 }), 0, 2.35, 1.83))

  buildPot(m, -1.9, 0, 1.9)
  buildPot(m, 1.9, 0, 1.9)

  g.add(m)
  colliders.push({ x, z, r: 3.1 })
  fade.push({ group: m, center: new THREE.Vector3(x, 2.6, z), radius: 3.6 })
}

/** The slushie shack by the beach — a tiny blue hut. */
function buildSlushieHut(g: THREE.Group, colliders: Circle[], fade: FadeProp[], x: number, z: number, rotY: number): void {
  buildTinyHouse(g, colliders, fade, x, z, rotY, undefined, HOUSE_SLUSHIE)
}

function groundHeightAtSafe(x: number, z: number): number {
  void x
  void z
  return 0 // museum & slushie sit on open sand
}
function buildTinyHouse(
  g: THREE.Group,
  colliders: Circle[],
  fade: FadeProp[],
  x: number,
  z: number,
  rotY: number,
  awningStripes?: THREE.CanvasTexture,
  colors: HouseColors = HOUSE_BARBER,
): void {
  const h = new THREE.Group()
  h.position.set(x, 0.22, z) // sits on the plaza plinth
  h.rotation.y = rotY

  const walls = mesh(new RoundedBoxGeometry(1.7, 1.15, 1.4, 4, 0.28), matte(colors.wall), 0, 0.72, 0)
  h.add(walls)
  const band = mesh(new RoundedBoxGeometry(1.76, 0.32, 1.46, 3, 0.14), matte(colors.band), 0, 0.26, 0)
  h.add(band)

  // chunky pyramid roof
  const roof = mesh(new THREE.ConeGeometry(1.55, 0.95, 4, 1), matte(colors.roof, { flat: true }), 0, 1.72, 0)
  roof.rotation.y = Math.PI / 4
  h.add(roof)
  const trim = mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.16, 4, 1), matte('#fff6ec', { flat: true }), 0, 1.28, 0)
  trim.rotation.y = Math.PI / 4
  h.add(trim)
  const finial = mesh(new THREE.SphereGeometry(0.11, 10, 8), matte(PAL.flowerYellow), 0, 2.24, 0)
  h.add(finial)

  // door + knob
  const door = mesh(new RoundedBoxGeometry(0.5, 0.72, 0.1, 3, 0.18), matte(colors.band), 0, 0.56, 0.71)
  h.add(door)
  const knob = mesh(new THREE.SphereGeometry(0.035, 8, 8), matte(PAL.flowerYellow, { roughness: 0.4 }), 0.15, 0.54, 0.77)
  h.add(knob)

  // two tiny round windows — glass proud of the wall face (z = 0.7) to avoid z-fighting
  for (const side of [-1, 1]) {
    const frame = mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), matte(PAL.plankDark), side * 0.52, 0.85, 0.75)
    h.add(frame)
    const glass = mesh(new THREE.CircleGeometry(0.125, 16), matte(PAL.white, { roughness: 0.3 }), side * 0.52, 0.85, 0.73)
    h.add(glass)
  }

  // heart sign above the door
  const heart = mesh(heartGeometry(0.22), matte(PAL.blossomPink), 0, 1.08, 0.73)
  h.add(heart)

  // tiny scalloped awning (barber-striped when a stripe texture is passed)
  const slopeMat = awningStripes
    ? new THREE.MeshStandardMaterial({ map: awningStripes, roughness: 0.9 })
    : matte(PAL.awning)
  const slope = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.42), slopeMat)
  slope.position.set(0, 0.98, 0.85)
  slope.rotation.x = 0.4
  slope.castShadow = true
  h.add(slope)
  const scallopColor = awningStripes ? '#e05a6d' : PAL.awning
  for (let i = 0; i < 3; i++) {
    const scallop = mesh(new THREE.SphereGeometry(0.09, 8, 8), matte(scallopColor), -0.26 + i * 0.26, 0.86, 0.98)
    scallop.scale.set(1, 0.7, 0.55)
    h.add(scallop)
  }

  // potted plants flanking the door
  buildPot(h, -0.95, 0, 0.85)
  buildPot(h, 0.95, 0, 0.85)

  // barber decor: giant scissors + comb leaning by the door
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa8b8', roughness: 0.3, metalness: 0.7 })
  const scissors = new THREE.Group()
  scissors.position.set(0.62, 0.32, 0.95)
  scissors.rotation.z = 0.5
  scissors.rotation.x = -0.12
  for (const ang of [0.26, -0.26]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.02), steel)
    blade.rotation.z = ang
    blade.castShadow = true
    scissors.add(blade)
  }
  for (const sx of [-0.12, 0.12]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 14), steel)
    ring.position.set(sx, -0.3, 0)
    scissors.add(ring)
  }
  h.add(scissors)
  const comb = new THREE.Group()
  comb.position.set(1.2, 0.28, 0.9)
  comb.rotation.z = 0.35
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.035), matte(PAL.hutPurple))
  comb.add(spine)
  for (let i = 0; i < 7; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.13, 0.025), matte(PAL.hutPurple))
    tooth.position.set(Math.sin((i - 3) * 0.09) * 0.02, -0.24, 0)
    tooth.rotation.z = (i - 3) * -0.03
    comb.add(tooth)
  }
  h.add(comb)

  g.add(h)
  colliders.push({ x, z, r: 1.35 })
  fade.push({ group: h, center: new THREE.Vector3(x, 1.3, z), radius: 1.9 })
}

/** Standing wooden shop sign with a rounded label board. */
function buildShopSign(
  g: THREE.Group,
  colliders: Circle[],
  bumps: Bump[],
  x: number,
  z: number,
  rotY: number,
  text: string,
  bg: string,
  border: string,
): void {
  const s = new THREE.Group()
  s.position.set(x, groundHeightAt(x, z, bumps), z)
  s.rotation.y = rotY

  const post = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.0, 10), matte(PAL.logDark), 0, 0.5, 0)
  s.add(post)
  const board = mesh(new RoundedBoxGeometry(1.55, 0.58, 0.1, 3, 0.08), matte(PAL.cream), 0, 1.2, 0)
  s.add(board)
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.46, 0.52),
    new THREE.MeshBasicMaterial({ map: makeBoardTexture(text, bg, border, '#5a4438'), transparent: true }),
  )
  label.position.set(0, 1.2, 0.056)
  s.add(label)
  // playful little tilt
  s.rotation.z = rr(-0.03, 0.03)

  g.add(s)
  colliders.push({ x, z, r: 0.28, h: 1.0 })
}

/** A swirly soft-serve cone on the ground by the ice cream shop. */
function buildIceCreamProp(g: THREE.Group, bumps: Bump[], x: number, z: number): void {
  const p = new THREE.Group()
  p.position.set(x, groundHeightAt(x, z, bumps), z)
  const cone = mesh(new THREE.ConeGeometry(0.11, 0.26, 10), matte('#e0a868'), 0, 0.13, 0)
  cone.rotation.x = Math.PI // point down
  p.add(cone)
  p.add(mesh(new THREE.SphereGeometry(0.105, 12, 10), matte(PAL.blossomPink), 0, 0.3, 0))
  p.add(mesh(new THREE.SphereGeometry(0.095, 12, 10), matte(PAL.white), 0, 0.44, 0))
  p.add(mesh(new THREE.SphereGeometry(0.035, 8, 8), matte('#e05a6d'), 0, 0.55, 0))
  g.add(p)
}

/** Classic spinning barber pole. Returns the pole mesh for the spinner list. */
function buildBarberPole(g: THREE.Group, colliders: Circle[], bumps: Bump[], x: number, z: number): THREE.Mesh {
  const p = new THREE.Group()
  const y = groundHeightAt(x, z, bumps)
  p.position.set(x, y, z)
  const stripes = makeStripeTexture()
  stripes.repeat.set(2, 1)
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.6, 14),
    new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }),
  )
  pole.position.y = 0.72
  pole.castShadow = true
  p.add(pole)
  for (const cy of [0.38, 1.06]) {
    const cap = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14), matte(PAL.flowerYellow, { roughness: 0.4 }), 0, cy, 0)
    p.add(cap)
  }
  p.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), matte(PAL.flowerYellow), 0, 1.13, 0))
  const base = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 14), matte(PAL.logDark), 0, 0.07, 0)
  p.add(base)
  g.add(p)
  colliders.push({ x, z, r: 0.2, h: 0.5 })
  return pole
}

/** Giant soft-serve sundae sitting on a rooftop. */
function buildRoofSundae(g: THREE.Group, x: number, y: number, z: number): void {
  const s = new THREE.Group()
  s.position.set(x, y, z)
  const cone = mesh(new THREE.ConeGeometry(0.34, 0.55, 12), matte('#e0a868'), 0, 0.14, 0)
  cone.rotation.x = Math.PI // tip down, base up
  s.add(cone)
  const swirl1 = mesh(new THREE.SphereGeometry(0.31, 14, 12), matte(PAL.white), 0, 0.5, 0)
  swirl1.scale.y = 0.85
  s.add(swirl1)
  const swirl2 = mesh(new THREE.SphereGeometry(0.24, 14, 12), matte(PAL.blossomPink), 0, 0.74, 0)
  swirl2.scale.y = 0.85
  s.add(swirl2)
  s.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), matte(PAL.white), 0, 0.95, 0))
  s.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), matte('#e05a6d'), 0, 1.09, 0))
  g.add(s)
}

// ---------------------------------------------------------------- beach

function buildBeach(g: THREE.Group, colliders: Circle[], bumps: Bump[], fade: FadeProp[]): void {
  // golden sand swept along the east shore — registered as walkable terrain
  const sandSpots: [number, number, number][] = [
    [20.5, 0, 4.6], [22.6, 2.6, 3.0], [22.6, -2.8, 3.0], [18.5, 4.5, 2.6], [18.5, -4.5, 2.6],
  ]
  for (const [x, z, r] of sandSpots) {
    const sand = mesh(new THREE.SphereGeometry(r, 26, 18), matte(PAL.beach), x, 0.0, z)
    sand.scale.set(1.1, 0.13, 1)
    sand.castShadow = false
    g.add(sand)
    bumps.push({ x, z, r: r * 1.1, h: r * 0.13 })
  }

  // shallow lagoon ringing the island + foam at the shoreline
  const lagoon = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_R + 0.3, 55, 48),
    new THREE.MeshStandardMaterial({ color: PAL.lagoon, transparent: true, opacity: 0.92, roughness: 0.35 }),
  )
  lagoon.rotation.x = -Math.PI / 2
  lagoon.position.y = -1.9
  g.add(lagoon)
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_R - 0.2, ISLAND_R + 0.6, 48),
    new THREE.MeshStandardMaterial({ color: PAL.foam, transparent: true, opacity: 0.75, roughness: 0.6 }),
  )
  foam.rotation.x = -Math.PI / 2
  foam.position.y = -1.8
  g.add(foam)

  // beach umbrella (striped canopy)
  const stripes = makeStripeTexture()
  stripes.repeat.set(4, 1)
  const ux = 21.2
  const uz = 3.2
  const umbrella = new THREE.Group()
  const umbGh = groundHeightAt(ux, uz, bumps)
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), matte(PAL.logDark), 0, 1.15, 0)
  pole.rotation.z = 0.12
  umbrella.add(pole)
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 0.6, 12),
    new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85 }),
  )
  canopy.position.set(0.28, 2.2, 0)
  canopy.castShadow = true
  umbrella.add(canopy)
  umbrella.position.set(ux, umbGh, uz)
  g.add(umbrella)
  // the canopy is wide and sits at head height — ghost it when it blocks the view
  fade.push({ group: umbrella, center: new THREE.Vector3(ux, 2.2, uz), radius: 1.7 })

  // lounge chair
  const ch = new THREE.Group()
  const chGh = groundHeightAt(20.1, 1.7, bumps)
  ch.position.set(20.1, chGh + 0.12, 1.7)
  ch.rotation.y = -2.4
  const frame = matte('#fff8ec')
  const seat = mesh(new RoundedBoxGeometry(0.72, 0.09, 1.7, 3, 0.04), frame, 0, 0.42, 0)
  seat.rotation.x = -0.28
  ch.add(seat)
  const back = mesh(new RoundedBoxGeometry(0.72, 0.8, 0.09, 3, 0.04), frame, 0, 0.78, -0.82)
  back.rotation.x = -0.5
  ch.add(back)
  const cushion = mesh(new RoundedBoxGeometry(0.62, 0.07, 1.5, 3, 0.035), matte(PAL.blossomPink), 0, 0.49, 0.04)
  cushion.rotation.x = -0.28
  ch.add(cushion)
  for (const [lx, lz] of [[-0.28, 0.7], [0.28, 0.7], [-0.28, -0.6], [0.28, -0.6]] as [number, number][]) {
    ch.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), matte(PAL.logDark), lx, 0.21, lz))
  }
  g.add(ch)
  colliders.push({ x: 20.1, z: 1.7, r: 0.55, h: 0.6 })

  // bucket
  const bk = new THREE.Group()
  bk.position.set(21.9, groundHeightAt(21.9, 1.1, bumps) + 0.02, 1.1)
  bk.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 12), matte('#7fc8d8'), 0, 0.15, 0))
  bk.add(mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 14, Math.PI), matte(PAL.logDark), 0, 0.3, 0))
  g.add(bk)

  // --- sandcastle: the beach's landmark ---
  const kx = 17.2
  const kz = -1.4
  const castle = new THREE.Group()
  castle.position.set(kx, groundHeightAt(kx, kz, bumps), kz)
  castle.rotation.y = 0.4
  const sandMat = matte(PAL.beachDeep)
  castle.add(mesh(new THREE.CylinderGeometry(0.8, 0.95, 1.0, 8), sandMat, 0, 0.5, 0))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    castle.add(mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), sandMat, Math.cos(a) * 0.76, 1.11, Math.sin(a) * 0.76))
  }
  for (const [tx, tz] of [[-0.95, -0.85], [1.0, -0.8], [0.9, 0.95]] as [number, number][]) {
    castle.add(mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.4, 8), sandMat, tx, 0.7, tz))
    castle.add(mesh(new THREE.ConeGeometry(0.34, 0.46, 8), sandMat, tx, 1.62, tz))
  }
  castle.add(mesh(new THREE.CircleGeometry(0.2, 12), matte('#a07a4e'), 0, 0.42, 0.94))
  castle.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), matte(PAL.logDark), 0, 1.5, 0))
  castle.add(mesh(new THREE.PlaneGeometry(0.36, 0.22), matte(PAL.blossomPink), 0.2, 1.72, 0))
  g.add(castle)
  colliders.push({ x: kx, z: kz, r: 1.15 })

  // shells scattered along the sand
  const shellColors = ['#ffd9e6', '#ffe9b8', '#cfe8f5', '#f7b8cf', '#fff6ec']
  const shellSpots: [number, number][] = [
    [19.4, -2.6], [20.6, 5.2], [18.2, 2.4], [21.4, -4.0], [16.8, 1.0], [19.8, 6.4], [17.6, -4.4], [22.2, 0.4],
  ]
  shellSpots.forEach(([sx, sz], i) => {
    const shell = new THREE.Group()
    shell.position.set(sx, groundHeightAt(sx, sz, bumps), sz)
    shell.rotation.y = rand() * Math.PI * 2
    const dome = mesh(new THREE.SphereGeometry(0.13, 12, 8), matte(shellColors[i % shellColors.length]), 0, 0.06, 0)
    dome.scale.y = 0.6
    shell.add(dome)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      shell.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), matte(shellColors[(i + 1) % shellColors.length]), Math.cos(a) * 0.13, 0.07, Math.sin(a) * 0.13))
    }
    g.add(shell)
  })

  // a beach ball, because it is a beach
  const ball = new THREE.Group()
  ball.position.set(19.0, groundHeightAt(19.0, 0.2, bumps) + 0.22, 0.2)
  const ballColors = ['#ff8fb4', '#fff6ec', '#7fc8f0']
  for (let i = 0; i < 3; i++) {
    ball.add(mesh(new THREE.SphereGeometry(0.22, 14, 10, (i / 3) * Math.PI * 2, Math.PI / 1.5), matte(ballColors[i]), 0, 0, 0))
  }
  g.add(ball)
  colliders.push({ x: 19.0, z: 0.2, r: 0.26, h: 0.45 })
}

// ---------------------------------------------------------------- playground

function buildPlayground(
  g: THREE.Group,
  colliders: Circle[],
  bumps: Bump[],
  fade: FadeProp[],
  cx: number,
  cz: number,
): Playground {
  // merry bench geometry — one source of truth for the mesh and the ride anchor
  const SEAT_R = 0.88
  const SEAT_TOP = 0.71
  // the playground sits on grass mounds; each frame is dropped onto the ground
  // under it, otherwise the short ones sink in and are impossible to find
  const onGround = (x: number, z: number) => groundHeightAt(x, z, bumps)

  const pg: Playground = {
    merry: new THREE.Group(),
    merrySeat: { angle: 0, radius: SEAT_R, y: SEAT_TOP },
    swingPivots: [],
    slide: new THREE.Group(),
    slideTop: new THREE.Vector3(),
    slideBottom: new THREE.Vector3(),
    slideExit: new THREE.Vector3(),
    bars: new THREE.Group(),
    barsFrom: new THREE.Vector3(),
    barsTo: new THREE.Vector3(),
  }

  // --- merry-go-round (walkable platform + spinning top) ---
  const merry = new THREE.Group()
  merry.position.set(cx - 2.3, 0, cz - 0.8)
  merry.add(mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.3, 26), matte(PAL.plankDark), 0, 0.15, 0))
  const disc = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.18, 26), matte(PAL.blossomPink), 0, 0.42, 0)
  disc.castShadow = true
  merry.add(disc)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    merry.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8), matte('#fff8ec'), Math.cos(a) * 1.15, 0.98, Math.sin(a) * 1.15))
  }
  merry.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10), matte(PAL.logDark), 0, 0.95, 0))
  const topRing = mesh(new THREE.TorusGeometry(1.18, 0.055, 8, 26), matte(PAL.hutPurple), 0, 1.42, 0)
  topRing.rotation.x = Math.PI / 2
  merry.add(topRing)

  // a little bench under each grab pole, facing outward — the kitten rides the first
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const seat = new THREE.Group()
    seat.position.set(Math.cos(a) * SEAT_R, 0, Math.sin(a) * SEAT_R)
    seat.rotation.y = Math.PI / 2 - a // local +z points outward, radially
    seat.add(mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.18, 8), matte(PAL.logDark), 0, SEAT_TOP - 0.135, 0))
    seat.add(mesh(new RoundedBoxGeometry(0.48, 0.09, 0.44, 3, 0.035), matte(PAL.blossomPink), 0, SEAT_TOP - 0.045, 0))
    seat.add(mesh(new RoundedBoxGeometry(0.46, 0.3, 0.08, 3, 0.03), matte(PAL.hutPurple), 0, SEAT_TOP + 0.16, -0.2))
    merry.add(seat)
  }

  pg.merry = merry
  g.add(merry)
  bumps.push({ x: cx - 2.3, z: cz - 0.8, r: 1.8, h: 0.48, flat: true })

  // --- swings ---
  const sw = new THREE.Group()
  sw.position.set(cx + 2.8, onGround(cx + 2.8, cz + 1.6), cz + 1.6)
  for (const sx of [-1.25, 1.25]) {
    for (const sz of [-0.55, 0.55]) {
      const leg = mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 8), matte(PAL.logDark), sx, 1.25, sz)
      leg.rotation.z = sx > 0 ? -0.22 : 0.22
      sw.add(leg)
    }
  }
  const beam = mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 8), matte(PAL.logDark), 0, 2.42, 0)
  beam.rotation.z = Math.PI / 2
  sw.add(beam)
  for (const px of [-0.65, 0.65]) {
    const pivot = new THREE.Group()
    pivot.position.set(px, 2.36, 0)
    sw.add(pivot)
    pg.swingPivots.push(pivot)
    pivot.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 6), matte(PAL.log), -0.2, -0.85, 0))
    pivot.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 6), matte(PAL.log), 0.2, -0.85, 0))
    pivot.add(mesh(new RoundedBoxGeometry(0.56, 0.07, 0.32, 3, 0.03), matte(PAL.blossomPink), 0, -1.68, 0))
  }
  g.add(sw)
  colliders.push({ x: cx + 2.8, z: cz + 1.6, r: 0.3 })

  // --- slide ---
  const slide = new THREE.Group()
  slide.position.set(cx - 0.8, onGround(cx - 0.8, cz + 3.2), cz + 3.2)
  slide.rotation.y = 0.5
  for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as [number, number][]) {
    slide.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8), matte(PAL.logDark), lx, 0.8, lz))
  }
  slide.add(mesh(new RoundedBoxGeometry(1.3, 0.12, 1.3, 3, 0.05), matte(PAL.flowerYellow), 0, 1.62, 0))
  for (let i = 0; i < 4; i++) {
    slide.add(mesh(new RoundedBoxGeometry(0.5, 0.06, 0.14, 2, 0.02), matte(PAL.log), 0, 0.4 + i * 0.38, -0.72))
  }
  const chute = mesh(new RoundedBoxGeometry(0.8, 0.09, 3.1, 3, 0.04), matte(PAL.blossomPink), 0, 0.85, 1.9)
  chute.rotation.x = 0.62
  chute.castShadow = true
  slide.add(chute)
  const railL = mesh(new RoundedBoxGeometry(0.09, 0.3, 3.0, 2, 0.03), matte(PAL.flowerYellow), -0.42, 1.02, 1.9)
  railL.rotation.x = 0.62
  const railR = railL.clone()
  railR.position.x = 0.42
  slide.add(railL, railR)
  pg.slide = slide
  pg.slideTop.set(0, 1.78, 0.5)
  pg.slideBottom.set(0, 0.18, 3.1)
  pg.slideExit.set(0, 0, 3.9)
  g.add(slide)
  colliders.push({ x: cx - 0.8, z: cz + 3.2, r: 0.2 })

  // --- monkey bars ---
  const bars = new THREE.Group()
  bars.position.set(cx + 3.8, onGround(cx + 3.8, cz - 1.6), cz - 1.6)
  bars.rotation.y = -0.5
  for (const bx of [-1.55, 1.55]) {
    bars.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8), matte(PAL.logDark), bx, 0.95, 0))
  }
  const topBeam = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 8), matte(PAL.logDark), 0, 1.98, 0)
  topBeam.rotation.z = Math.PI / 2
  bars.add(topBeam)
  for (let i = 0; i < 6; i++) {
    const rung = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), matte(PAL.log), -1.35 + i * 0.54, 1.9, 0)
    rung.rotation.x = Math.PI / 2
    bars.add(rung)
  }
  pg.bars = bars
  pg.barsFrom.set(-1.35, 1.2, 0)
  pg.barsTo.set(1.35, 1.2, 0)
  g.add(bars)
  colliders.push({ x: cx + 3.8, z: cz - 1.6, r: 0.3 })

  // the ride frames stand between the camera and the kitten constantly
  fade.push({ group: sw, center: new THREE.Vector3(cx + 2.8, 1.4, cz + 1.6), radius: 1.8 })
  fade.push({ group: bars, center: new THREE.Vector3(cx + 3.8, 1.2, cz - 1.6), radius: 1.9 })
  fade.push({ group: slide, center: new THREE.Vector3(cx - 0.8, 1.1, cz + 3.2), radius: 1.8 })
  fade.push({ group: merry, center: new THREE.Vector3(cx - 2.3, 1.0, cz - 0.8), radius: 2.0 })

  return pg
}

function buildSignpost(g: THREE.Group, colliders: Circle[], fade: FadeProp[], x: number, z: number): void {
  const post = new THREE.Group()
  post.position.set(x, 0, z)
  const pole = mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.7, 10), matte(PAL.logDark), 0, 0.85, 0)
  post.add(pole)

  // plain words, and names a child can actually see from here
  const boards: { text: string; y: number; dir: 1 | -1; color: string }[] = [
    { text: 'Round Stones', y: 1.38, dir: 1, color: PAL.plank },
    { text: 'Bear House', y: 0.92, dir: -1, color: PAL.log },
  ]
  for (const b of boards) {
    const board = new THREE.Group()
    board.position.y = b.y
    board.rotation.y = b.dir === 1 ? -0.5 : 2.6
    const body = mesh(new RoundedBoxGeometry(1.5, 0.42, 0.1, 3, 0.05), matte(b.color), b.dir * 0.32, 0, 0)
    board.add(body)
    const tip = mesh(new THREE.ConeGeometry(0.24, 0.3, 3), matte(b.color), b.dir * 1.15, 0, 0)
    tip.rotation.z = b.dir * -Math.PI / 2
    tip.rotation.y = Math.PI
    board.add(tip)
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.24, 0.33),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture(b.text, '#fff8ee'), transparent: true }),
    )
    label.position.set(b.dir * 0.3, 0, 0.06)
    board.add(label)
    post.add(board)
  }
  g.add(post)
  colliders.push({ x, z, r: 0.3 })
  fade.push({ group: post, center: new THREE.Vector3(x, 1.2, z), radius: 0.9 })
}

// ---------------------------------------------------------------- extras

function buildPicnic(g: THREE.Group, colliders: Circle[], x: number, z: number): void {
  // checkered blanket
  const blanket = mesh(
    new RoundedBoxGeometry(2.3, 0.07, 2.3, 4, 0.03),
    new THREE.MeshStandardMaterial({ map: makeCheckerTexture('#fff6ec', '#f2a7c3'), roughness: 0.95 }),
    x,
    0.05,
    z,
  )
  blanket.castShadow = false
  g.add(blanket)

  // basket
  const basket = new THREE.Group()
  basket.position.set(x + 0.5, 0.08, z - 0.4)
  const bBody = mesh(new THREE.SphereGeometry(0.34, 14, 12), matte(PAL.log), 0, 0.2, 0)
  bBody.scale.set(1.1, 0.85, 1)
  basket.add(bBody)
  const handle = mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 16, Math.PI), matte(PAL.logDark), 0, 0.36, 0)
  basket.add(handle)
  g.add(basket)
  colliders.push({ x: x + 0.5, z: z - 0.4, r: 0.45, h: 0.55 })

  // snacks on the blanket
  const snack1 = mesh(new THREE.SphereGeometry(0.11, 10, 8), matte('#f2778c'), x - 0.5, 0.14, z + 0.35)
  g.add(snack1)
  const snack2 = mesh(new THREE.SphereGeometry(0.11, 10, 8), matte(PAL.flowerYellow), x - 0.2, 0.14, z + 0.5)
  g.add(snack2)
  const leaf = mesh(new THREE.SphereGeometry(0.14, 10, 8), matte(PAL.grassLight), x - 0.75, 0.12, z - 0.15)
  leaf.scale.set(1, 0.35, 0.7)
  g.add(leaf)
}

function buildSittingLogs(g: THREE.Group, colliders: Circle[], x: number, z: number, rotY: number): void {
  for (const [dx, dz] of [[0, 0], [1.4, 0.6]] as [number, number][]) {
    const lx = x + dx
    const lz = z + dz
    const log = mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.5, 14), matte(PAL.log), lx, 0.28, lz)
    log.rotation.z = Math.PI / 2
    log.rotation.y = rotY
    g.add(log)
    for (const side of [-1, 1]) {
      const capDir = new THREE.Vector3(Math.cos(rotY) * side, 0, -Math.sin(rotY) * side).multiplyScalar(0.755)
      const cap = mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.02, 14), matte('#e8c79a'), lx + capDir.x, 0.28, lz + capDir.z)
      cap.rotation.z = Math.PI / 2
      cap.rotation.y = rotY
      g.add(cap)
    }
    colliders.push({ x: lx, z: lz, r: 0.45, h: 0.45 })
  }
}

function buildClouds(g: THREE.Group): void {
  const spots: [number, number, number, number][] = [
    [-18, -3.5, -14, 3.2], [20, -2.8, -6, 2.6], [8, -4.5, 18, 3.6], [-14, -3.2, 17, 2.4],
    [26, 2.5, 8, 2.2], [-27, 3.5, -2, 2.6], [2, 5.5, -24, 3.0],
  ]
  const cloudMat = matte(PAL.cloud, { roughness: 1, emissive: PAL.cloud, emissiveIntensity: 0.25 })
  for (const [x, y, z, s] of spots) {
    const cloud = new THREE.Group()
    cloud.position.set(x, y, z)
    const puffs = 4 + Math.floor(rand() * 2)
    for (let i = 0; i < puffs; i++) {
      const r = rr(0.55, 1.0) * s
      const p = mesh(new THREE.SphereGeometry(r, 14, 10), cloudMat, (i - puffs / 2) * 0.75 * s, rr(-0.1, 0.2) * s, rr(-0.3, 0.3) * s)
      p.scale.y = 0.72
      p.castShadow = false
      cloud.add(p)
    }
    g.add(cloud)
  }
}

function buildButterflies(g: THREE.Group, butterflies: Butterfly[]): void {
  const defs: { cx: number; cz: number; color: string }[] = [
    { cx: 2.5, cz: 8.5, color: PAL.blossomPurple },
    { cx: -8, cz: 9.5, color: PAL.blossomPink },
    { cx: 9.5, cz: -6, color: PAL.flowerYellow },
  ]
  for (const d of defs) {
    const group = new THREE.Group()
    const wingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: 0.8, side: THREE.DoubleSide })
    const body = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), matte(PAL.ink), 0, 0, 0)
    body.rotation.x = Math.PI / 2
    group.add(body)
    const wings: [THREE.Object3D, THREE.Object3D] = [new THREE.Group(), new THREE.Group()]
    for (const [i, side] of [0, 1].map((v) => [v, v === 0 ? -1 : 1] as [number, number])) {
      const pivot = wings[i]
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), wingMat)
      wing.scale.set(1.3, 0.9, 0.12)
      wing.position.x = side * 0.13
      pivot.add(wing)
      group.add(pivot)
    }
    group.position.set(d.cx, 1.2, d.cz)
    g.add(group)
    butterflies.push({
      group,
      center: new THREE.Vector3(d.cx, 0, d.cz),
      radius: rr(1.2, 2.2),
      speed: rr(0.5, 0.9) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      height: rr(0.9, 1.5),
      wings,
    })
  }
}

// ---------------------------------------------------------------- flame list shared per-build

const flames: THREE.Mesh[] = []

export function buildWorld(): World {
  const g = new THREE.Group()
  const colliders: Circle[] = []
  const bumps: Bump[] = []
  const fadeProps: FadeProp[] = []
  flames.length = 0
  const butterflies: Butterfly[] = []

  buildTerrain(g, colliders, bumps)

  // paths: spawn → plaza, plaza → hut, plaza → picnic
  buildPlankPath(g, colliders, new THREE.Vector2(0, 8.6), new THREE.Vector2(0.1, 3.4), 1.8)
  buildPlankPath(g, colliders, new THREE.Vector2(-2.9, -1.6), new THREE.Vector2(-5.6, -4.6), 1.5)
  buildPlankPath(g, colliders, new THREE.Vector2(3.0, -1.2), new THREE.Vector2(6.6, 0.2), 1.5)

  buildPlaza(g, colliders, bumps, 0, -1.5)
  buildTinyHouse(g, colliders, fadeProps, 0, -1.5, 0.3, makeStripeTexture())

  // resort & village landmarks
  buildMuseum(g, colliders, fadeProps, 0, -16, 0)
  buildShopSign(g, colliders, bumps, 2.2, -12.4, 0, 'Museum', '#fff3c8', '#d8a94e')
  buildSlushieHut(g, colliders, fadeProps, 11.5, -3.5, -1.4)
  const playground = buildPlayground(g, colliders, bumps, fadeProps, -14.5, 11.8)
  const farm = buildFarm(g, colliders, bumps, 8, -15)

  // shop signage: ice cream at the cottage, barber at the tiny house
  buildShopSign(g, colliders, bumps, -6.06, -3.04, 0.6, 'Ice Cream Shop', '#ffe3ee', '#e88ab0')
  buildIceCreamProp(g, bumps, -5.75, -2.59)
  buildIceCreamProp(g, bumps, -6.55, -2.35)
  buildIceCreamProp(g, bumps, -6.7, -4.3)
  buildShopSign(g, colliders, bumps, 0.7, 0.75, 0.3, 'Barber Shop', '#e8f4fb', '#7fb3d8')
  const barberPole = buildBarberPole(g, colliders, bumps, 1.17, 0.6)
  const spinners = [barberPole]
  buildBeach(g, colliders, bumps, fadeProps)

  // buildings & props
  buildHut(g, colliders, fadeProps, -8.3, -7.2, 0.6)
  buildRoofSundae(g, -8.3, 4.28, -7.2) // giant soft-serve on Kuma's roof
  buildSignpost(g, colliders, fadeProps, 1.9, 5.4)
  buildPicnic(g, colliders, 8.6, 1.2)
  buildSittingLogs(g, colliders, 9.8, 3.4, 0.35)

  // trees — a mix of silhouettes so directions can name something you can spot
  buildTree(g, colliders, fadeProps, 7.8, -9.2, 1.25) // round tree by the museum
  buildTree(g, colliders, fadeProps, -6.2, -11.4, 1.1)
  buildTree(g, colliders, fadeProps, 8.6, 8.6, 1.05)
  buildTree(g, colliders, fadeProps, -8.6, 11.0, 1.2, 'pine') // the tall pine by the playground
  buildTree(g, colliders, fadeProps, 4.6, -6.2, 0.95, 'blossom') // the big pink blossom tree
  buildTree(g, colliders, fadeProps, -3.2, 5.8, 0.8, 'blossom')
  buildTree(g, colliders, fadeProps, -14.5, -6.8, 0.95, 'blossom')
  buildTree(g, colliders, fadeProps, 4.2, -13.6, 1.15, 'pine') // pine beside the museum
  // palms along the beach
  buildTree(g, colliders, fadeProps, 21.5, 5.6, 1.0, 'palm')
  buildTree(g, colliders, fadeProps, 21.8, -5.2, 0.95, 'palm')
  buildTree(g, colliders, fadeProps, 17.5, 7.2, 0.9, 'palm')

  // bushes
  const bushSpots: [number, number, number][] = [
    [5.8, -4.0, 1.0], [-4.4, -3.6, 0.9], [2.6, 3.2, 0.8], [-2.2, 9.0, 1.0],
    [-6.8, 1.8, 0.85], [10.8, -6.8, 1.05], [-10.2, -4.2, 0.95], [3.4, 12.0, 0.9],
    [12.4, 3.0, 0.8],
  ]
  for (const [x, z, s] of bushSpots) buildBush(g, colliders, x, z, s)

  // flowers scattered on grass
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2
    const d = rr(5.5, 18.5)
    buildFlower(g, bumps, Math.cos(a) * d, Math.sin(a) * d)
  }
  const flowerClusters: [number, number][] = [[2.5, 8.5], [-8, 9.5], [11.5, 2], [-12, -1.5], [9, 8]]
  for (const [cx, cz] of flowerClusters) {
    for (let i = 0; i < 5; i++) {
      buildFlower(g, bumps, cx + rr(-1.6, 1.6), cz + rr(-1.6, 1.6))
    }
  }

  buildClouds(g)
  buildButterflies(g, butterflies)
  const skyClouds = buildSky(g, rand)

  // widen the world: scale visuals + collision/height data together
  g.scale.setScalar(WORLD_SCALE)
  for (const c of colliders) {
    c.x *= WORLD_SCALE
    c.z *= WORLD_SCALE
    c.r *= WORLD_SCALE
    if (c.h !== undefined) c.h *= WORLD_SCALE
  }
  for (const b of bumps) {
    b.x *= WORLD_SCALE
    b.z *= WORLD_SCALE
    b.r *= WORLD_SCALE
    b.h *= WORLD_SCALE
  }
  const fadeables = fadeProps.map((fp) =>
    prepareFadeable(fp.group, fp.center.multiplyScalar(WORLD_SCALE), fp.radius * WORLD_SCALE),
  )

  return { group: g, colliders, bumps, butterflies, flames: [...flames], skyClouds, fadeables, spinners, playground, farm }
}

/** Per-frame world life: butterflies, torch flicker, clouds, merry-go-round, swings, farm. */
export function animateWorld(world: World, t: number): void {
  world.skyClouds.rotation.y = t * 0.0045 // very slow Ghibli drift
  for (const s of world.spinners) s.rotation.y = t * 2.2 // barber poles
  world.playground.merry.rotation.y = t * 0.55
  world.playground.swingPivots.forEach((p, i) => {
    p.rotation.z = Math.sin(t * 1.5 + i * 0.9) * 0.5
  })
  for (const a of world.farm) a.group.position.y = a.baseY + Math.sin(t * 2 + a.phase) * 0.025
  for (const b of world.butterflies) {
    const a = t * b.speed + b.phase
    b.group.position.set(
      b.center.x + Math.cos(a) * b.radius,
      b.height + Math.sin(t * 2.2 + b.phase) * 0.35,
      b.center.z + Math.sin(a) * b.radius,
    )
    b.group.rotation.y = -a + (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2)
    const flap = 0.35 + Math.abs(Math.sin(t * 16 + b.phase)) * 1.0
    b.wings[0].rotation.z = flap
    b.wings[1].rotation.z = -flap
  }
  for (let i = 0; i < world.flames.length; i++) {
    const f = world.flames[i]
    const s = 1 + Math.sin(t * 11 + i * 2.4) * 0.12 + Math.sin(t * 23 + i) * 0.06
    f.scale.set(s, 1.5 * s, s)
    ;(f.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t * 13 + i * 1.7) * 0.35
  }
}
