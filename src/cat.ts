import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PAL, matte, glossy } from './palette'

export type Species = 'kitten' | 'bunny' | 'bear' | 'penguin' | 'puppy'

export interface AnimalRig {
  group: THREE.Group // root at ground, faces +Z
  body: THREE.Group // squash & stretch + bob target
  head: THREE.Group
  tail: THREE.Group | null
  earL: THREE.Group | null
  earR: THREE.Group | null
  legFL: THREE.Group
  legFR: THREE.Group
  legBL: THREE.Group
  legBR: THREE.Group
  armL: THREE.Group | null
  armR: THREE.Group | null
  eyes: THREE.Mesh[]
  blob: THREE.Mesh
  headBaseY: number
  bodyBaseY: number
  nextBlinkAt: number
  blinkUntil: number
  species: Species
}

interface SpeciesConfig {
  bodyColor: string
  patchColor?: string
  bellyColor?: string
  muzzleColor?: string
  noseColor: string
  earOuter: string
  earInner: string
  bodyScale: [number, number, number]
  headRadius: number
  headY: number
  legStance: number // half-distance between left/right legs
  legY: number
  legR: number
  chubby: number // extra body width factor
}

const SPECIES: Record<Species, SpeciesConfig> = {
  kitten: {
    bodyColor: PAL.cream,
    patchColor: PAL.peach,
    muzzleColor: PAL.white,
    noseColor: PAL.blush,
    earOuter: PAL.cream,
    earInner: PAL.earPink,
    bodyScale: [0.36, 0.34, 0.42],
    headRadius: 0.3,
    headY: 0.8,
    legStance: 0.17,
    legY: 0.24,
    legR: 0.085,
    chubby: 1,
  },
  bunny: {
    bodyColor: PAL.bunny,
    noseColor: '#ff9db6',
    earOuter: PAL.bunny,
    earInner: PAL.earPink,
    bodyScale: [0.32, 0.33, 0.36],
    headRadius: 0.29,
    headY: 0.74,
    legStance: 0.16,
    legY: 0.23,
    legR: 0.08,
    chubby: 1.05,
  },
  bear: {
    bodyColor: PAL.bear,
    muzzleColor: PAL.bearMuzzle,
    noseColor: '#5a4438',
    earOuter: PAL.bear,
    earInner: '#e8bc8a',
    bodyScale: [0.4, 0.36, 0.42],
    headRadius: 0.32,
    headY: 0.82,
    legStance: 0.19,
    legY: 0.22,
    legR: 0.095,
    chubby: 1.12,
  },
  penguin: {
    bodyColor: PAL.penguin,
    bellyColor: PAL.penguinBelly,
    noseColor: PAL.beak,
    earOuter: PAL.penguin,
    earInner: PAL.penguin,
    bodyScale: [0.36, 0.4, 0.36],
    headRadius: 0.27,
    headY: 0.86,
    legStance: 0.12,
    legY: 0.16,
    legR: 0.08,
    chubby: 1.15,
  },
  puppy: {
    bodyColor: PAL.puppy,
    patchColor: PAL.puppyPatch,
    muzzleColor: PAL.white,
    noseColor: '#5a4438',
    earOuter: PAL.puppy,
    earInner: '#ffd9b8',
    bodyScale: [0.35, 0.34, 0.42],
    headRadius: 0.3,
    headY: 0.78,
    legStance: 0.18,
    legY: 0.24,
    legR: 0.09,
    chubby: 1.02,
  },
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function makeEyes(head: THREE.Group, cfg: SpeciesConfig): THREE.Mesh[] {
  const eyes: THREE.Mesh[] = []
  const r = cfg.headRadius
  const eyeX = r * 0.38
  const eyeY = r * 0.08
  const eyeZ = Math.sqrt(Math.max(0.01, r * r - eyeX * eyeX - eyeY * eyeY)) * 0.98
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(r * 0.19, 20, 20), glossy(PAL.ink), side * eyeX, eyeY, eyeZ)
    const spark = mesh(
      new THREE.SphereGeometry(r * 0.07, 10, 10),
      glossy(PAL.white),
      r * 0.05,
      r * 0.06,
      r * 0.14,
    )
    eye.add(spark)
    head.add(eye)
    eyes.push(eye)
  }
  return eyes
}

function makeMuzzle(head: THREE.Group, cfg: SpeciesConfig): void {
  if (!cfg.muzzleColor) return
  const r = cfg.headRadius
  const muzzle = mesh(
    new THREE.SphereGeometry(r * 0.52, 20, 20),
    matte(cfg.muzzleColor),
    0,
    -r * 0.28,
    r * 0.82,
  )
  muzzle.scale.set(1.05, 0.72, 0.68)
  head.add(muzzle)

  // nose
  const nose = mesh(
    new THREE.SphereGeometry(r * 0.11, 12, 12),
    glossy(cfg.noseColor),
    0,
    -r * 0.14,
    r * 1.13,
  )
  nose.scale.set(1.25, 0.9, 0.8)
  head.add(nose)

  // little "w" mouth
  const mouthMat = matte(PAL.ink)
  for (const side of [-1, 1]) {
    const arc = new THREE.TorusGeometry(r * 0.09, r * 0.02, 8, 12, Math.PI)
    const m = mesh(arc, mouthMat, side * r * 0.085, -r * 0.34, r * 1.1)
    m.rotation.z = Math.PI
    m.rotation.y = side * 0.25
    head.add(m)
  }
}

function makeBlush(head: THREE.Group, cfg: SpeciesConfig): void {
  const r = cfg.headRadius
  const mat = matte(PAL.blush, { roughness: 1 })
  for (const side of [-1, 1]) {
    const b = mesh(
      new THREE.SphereGeometry(r * 0.18, 12, 12),
      mat,
      side * r * 0.68,
      -r * 0.18,
      r * 0.62,
    )
    b.scale.set(0.9, 0.55, 0.35)
    head.add(b)
  }
}

function makeEars(head: THREE.Group, species: Species, cfg: SpeciesConfig): {
  earL: THREE.Group
  earR: THREE.Group
} {
  const r = cfg.headRadius
  const earL = new THREE.Group()
  const earR = new THREE.Group()

  if (species === 'kitten') {
    for (const [ear, side] of [
      [earL, -1],
      [earR, 1],
    ] as [THREE.Group, number][]) {
      const outer = mesh(
        new THREE.ConeGeometry(r * 0.42, r * 0.75, 20),
        matte(side < 0 && cfg.patchColor ? cfg.patchColor : cfg.earOuter),
        0,
        r * 0.38,
        0,
      )
      const inner = mesh(
        new THREE.ConeGeometry(r * 0.24, r * 0.52, 16),
        matte(cfg.earInner),
        0,
        r * 0.3,
        r * 0.1,
      )
      inner.scale.z = 0.6
      ear.add(outer, inner)
      ear.position.set(side * r * 0.62, r * 0.72, 0)
      ear.rotation.z = side * -0.32
      ear.rotation.x = -0.12
      head.add(ear)
    }
  } else if (species === 'bunny') {
    for (const [ear, side] of [
      [earL, -1],
      [earR, 1],
    ] as [THREE.Group, number][]) {
      const outer = mesh(
        new THREE.CapsuleGeometry(r * 0.26, r * 1.15, 8, 16),
        matte(cfg.earOuter),
        0,
        r * 0.85,
        0,
      )
      outer.scale.z = 0.62
      const inner = mesh(
        new THREE.CapsuleGeometry(r * 0.15, r * 0.95, 8, 16),
        matte(cfg.earInner),
        0,
        r * 0.85,
        r * 0.16,
      )
      inner.scale.z = 0.5
      ear.add(outer, inner)
      ear.position.set(side * r * 0.4, r * 0.82, -r * 0.05)
      ear.rotation.z = side * -0.16
      ear.rotation.x = -0.1
      head.add(ear)
    }
    // tiny flower on one ear
    const flower = new THREE.Group()
    const petalMat = matte(PAL.blossomPink)
    for (let i = 0; i < 5; i++) {
      const p = mesh(new THREE.SphereGeometry(r * 0.09, 10, 10), petalMat, 0, 0, 0)
      const a = (i / 5) * Math.PI * 2
      p.position.set(Math.cos(a) * r * 0.11, Math.sin(a) * r * 0.11, 0)
      p.scale.setScalar(0.9)
      flower.add(p)
    }
    flower.add(mesh(new THREE.SphereGeometry(r * 0.07, 10, 10), matte(PAL.flowerYellow), 0, 0, r * 0.04))
    flower.position.set(-r * 0.55, r * 1.2, 0)
    head.add(flower)
  } else if (species === 'bear') {
    for (const [ear, side] of [
      [earL, -1],
      [earR, 1],
    ] as [THREE.Group, number][]) {
      ear.add(mesh(new THREE.SphereGeometry(r * 0.36, 16, 16), matte(cfg.earOuter), 0, 0, 0))
      const inner = mesh(new THREE.SphereGeometry(r * 0.22, 12, 12), matte(cfg.earInner), 0, 0, r * 0.2)
      inner.scale.set(1, 1, 0.5)
      ear.add(inner)
      ear.position.set(side * r * 0.72, r * 0.78, 0)
      head.add(ear)
    }
  } else if (species === 'puppy') {
    for (const [ear, side] of [
      [earL, -1],
      [earR, 1],
    ] as [THREE.Group, number][]) {
      const outer = mesh(
        new THREE.CapsuleGeometry(r * 0.24, r * 0.62, 8, 16),
        matte(side < 0 && cfg.patchColor ? cfg.patchColor : cfg.earOuter),
        0,
        -r * 0.32,
        0,
      )
      outer.scale.set(1, 1, 0.5)
      ear.add(outer)
      ear.position.set(side * r * 0.78, r * 0.55, 0)
      ear.rotation.z = side * 0.55
      head.add(ear)
    }
  }
  // penguins have no ears
  return { earL, earR }
}

function makeTail(species: Species, cfg: SpeciesConfig): THREE.Group | null {
  const tail = new THREE.Group()

  if (species === 'kitten') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.14, -0.16),
      new THREE.Vector3(0, 0.34, -0.2),
      new THREE.Vector3(0, 0.46, -0.1),
    ])
    const tube = mesh(new THREE.TubeGeometry(curve, 20, 0.05, 10), matte(cfg.bodyColor))
    tail.add(tube)
    tail.add(mesh(new THREE.SphereGeometry(0.062, 12, 12), matte(cfg.bodyColor), 0, 0.46, -0.1))
    if (cfg.patchColor) {
      const ringMat = matte(cfg.patchColor)
      for (const t of [0.55, 0.85]) {
        const p = curve.getPoint(t)
        tail.add(mesh(new THREE.SphereGeometry(0.055, 10, 10), ringMat, p.x, p.y, p.z))
      }
    }
    tail.position.set(0, cfg.bodyScale[1] * 0.7, -cfg.bodyScale[2] * 0.82)
    tail.rotation.x = 0.25
    return tail
  }
  if (species === 'bunny') {
    tail.add(mesh(new THREE.SphereGeometry(0.1, 12, 12), matte(PAL.white)))
    tail.position.set(0, cfg.bodyScale[1] * 0.6, -cfg.bodyScale[2] * 0.9)
    return tail
  }
  if (species === 'puppy') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.16, -0.1),
      new THREE.Vector3(0, 0.28, -0.02),
    ])
    tail.add(mesh(new THREE.TubeGeometry(curve, 12, 0.045, 8), matte(cfg.bodyColor)))
    tail.add(mesh(new THREE.SphereGeometry(0.058, 10, 10), matte(cfg.patchColor ?? cfg.bodyColor), 0, 0.28, -0.02))
    tail.position.set(0, cfg.bodyScale[1] * 0.65, -cfg.bodyScale[2] * 0.85)
    return tail
  }
  return null // bears & penguins: none
}

/** Build a chibi animal. Root faces +Z; scale ~1.15 units tall. */
export function buildAnimal(species: Species): AnimalRig {
  const cfg = SPECIES[species]

  const group = new THREE.Group()
  group.scale.setScalar(1.12) // a touch bigger, so friends read from a distance
  const body = new THREE.Group()
  group.add(body)

  // ---- legs (pivot groups so they can swing while walking) ----
  const legs: THREE.Group[] = []
  const legPositions: [number, number][] = [
    [-cfg.legStance, cfg.legStance * 1.9], // FL
    [cfg.legStance, cfg.legStance * 1.9], // FR
    [-cfg.legStance * 1.15, -cfg.legStance * 1.8], // BL
    [cfg.legStance * 1.15, -cfg.legStance * 1.8], // BR
  ]
  const legMat = matte(cfg.bodyColor)
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Group()
    leg.position.set(lx, cfg.legY, lz)
    const foot = mesh(new THREE.SphereGeometry(cfg.legR, 14, 14), legMat, 0, -cfg.legY + cfg.legR * 0.9, 0)
    foot.scale.set(1.05, 1.05, 1.35)
    leg.add(foot)
    body.add(leg)
    legs.push(leg)
  }

  // ---- torso: a soft rounded box, not a bare sphere, so there is a chest,
  //      a waist and shoulders for the outfit to sit on ----
  const w = cfg.bodyScale[0] * cfg.chubby * 2
  const h = cfg.bodyScale[1] * 2
  const d = cfg.bodyScale[2] * 2
  const bodyY = h / 2 + 0.04
  body.add(mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * 0.44), matte(cfg.bodyColor), 0, bodyY, 0))

  // lighter chest so the front reads separately from the back
  body.add(
    mesh(
      new RoundedBoxGeometry(w * 0.66, h * 0.62, d * 0.3, 3, h * 0.26),
      matte(cfg.bellyColor ?? lighten(cfg.bodyColor)),
      0,
      bodyY - h * 0.04,
      d * 0.4,
    ),
  )

  if (cfg.patchColor) {
    const back = mesh(
      new THREE.SphereGeometry(1, 18, 16),
      matte(cfg.patchColor),
      cfg.bodyScale[0] * 0.3,
      cfg.bodyScale[1] * 1.45,
      -cfg.bodyScale[2] * 0.45,
    )
    back.scale.set(cfg.bodyScale[0] * 0.62, cfg.bodyScale[1] * 0.5, cfg.bodyScale[2] * 0.6)
    body.add(back)
  }

  // ---- arms (the penguin keeps its flippers instead) ----
  const arms: THREE.Group[] = []
  if (species !== 'penguin') {
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      arm.position.set(side * (w / 2 - 0.02), bodyY + h * 0.2, 0)
      arm.add(mesh(new THREE.CapsuleGeometry(cfg.legR * 0.9, h * 0.28, 4, 10), legMat, 0, -h * 0.18, 0))
      const paw = mesh(new THREE.SphereGeometry(cfg.legR * 0.98, 12, 10), legMat, 0, -h * 0.33, 0)
      paw.scale.set(1, 0.9, 1.2)
      arm.add(paw)
      arm.rotation.z = side * -0.26
      body.add(arm)
      arms.push(arm)
    }
  }

  // ---- head ----
  const head = new THREE.Group()
  head.position.y = cfg.headY
  body.add(head)

  const skull = mesh(new THREE.SphereGeometry(cfg.headRadius, 26, 22), matte(cfg.bodyColor), 0, cfg.headRadius * 0.35, 0)
  head.add(skull)

  const eyes = makeEyes(head, cfg)
  makeMuzzle(head, cfg)
  makeBlush(head, cfg)
  const { earL, earR } = makeEars(head, species, cfg)

  // kitten whiskers
  if (species === 'kitten' || species === 'puppy') {
    const wMat = matte(PAL.white)
    const r = cfg.headRadius
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const w = mesh(new THREE.BoxGeometry(r * 0.55, r * 0.028, r * 0.028), wMat, side * r * 0.95, -r * 0.22 + i * r * 0.09, r * 0.5)
        w.rotation.y = side * -0.35
        w.rotation.z = i * r * 0.14
        head.add(w)
      }
    }
  }

  // penguin beak + flippers + white face
  if (species === 'penguin') {
    const r = cfg.headRadius
    const face = mesh(new THREE.SphereGeometry(1, 20, 18), matte(PAL.penguinBelly), 0, r * 0.05, r * 0.55)
    face.scale.set(r * 0.82, r * 0.85, r * 0.6)
    head.add(face)
    const beak = mesh(new THREE.ConeGeometry(r * 0.16, r * 0.42, 12), matte(PAL.beak, { roughness: 0.6 }), 0, -r * 0.05, r * 1.0)
    beak.rotation.x = Math.PI / 2
    head.add(beak)
    for (const side of [-1, 1]) {
      const flipper = mesh(
        new THREE.CapsuleGeometry(0.09, 0.3, 6, 12),
        matte(cfg.bodyColor),
        side * cfg.bodyScale[0] * cfg.chubby * 0.95,
        cfg.bodyScale[1] * 1.0,
        0,
      )
      flipper.rotation.z = side * 0.75
      body.add(flipper)
    }
  }

  const tail = makeTail(species, cfg)
  if (tail) body.add(tail)

  // clothes and props, so each friend reads as themselves from across the island
  addOutfit(species, body, head, cfg, bodyY)

  // soft blob shadow for grounding during jumps
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.bodyScale[0] * 1.25, 24),
    new THREE.MeshBasicMaterial({ color: '#8b9bc4', transparent: true, opacity: 0.16, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.025
  group.add(blob)

  return {
    group,
    body,
    head,
    tail,
    earL,
    earR,
    legFL: legs[0],
    legFR: legs[1],
    legBL: legs[2],
    legBR: legs[3],
    armL: arms[0] ?? null,
    armR: arms[1] ?? null,
    eyes,
    blob,
    headBaseY: cfg.headY,
    bodyBaseY: 0,
    nextBlinkAt: 1 + Math.random() * 4,
    blinkUntil: 0,
    species,
  }
}

/**
 * Clothes and props. Every friend used to be a plain sphere, so a child could
 * not tell them apart; these give each one a silhouette you can name.
 */
function addOutfit(
  species: Species,
  body: THREE.Group,
  head: THREE.Group,
  cfg: SpeciesConfig,
  bodyY: number,
): void {
  const r = cfg.headRadius
  const w = cfg.bodyScale[0] * cfg.chubby * 2
  const h = cfg.bodyScale[1] * 2
  const d = cfg.bodyScale[2] * 2
  // sat just under the chin, and wide enough to clear the skull
  const neckY = cfg.headY - r * 0.18
  const collarR = r * 1.0

  if (species === 'kitten') {
    // a collar with a bell — the kitten you play is "the one with the bell"
    const collar = mesh(new THREE.TorusGeometry(collarR, r * 0.13, 8, 22), matte('#7fc8d8'), 0, neckY, 0)
    collar.rotation.x = Math.PI / 2
    body.add(collar)
    body.add(mesh(new THREE.SphereGeometry(r * 0.2, 12, 10), matte(PAL.flowerYellow, { roughness: 0.35 }), 0, neckY - r * 0.22, collarR * 0.92))
    return
  }

  if (species === 'bunny') {
    // dungarees
    const denim = matte('#8fb8e0')
    body.add(mesh(new RoundedBoxGeometry(w * 1.07, h * 0.42, d * 1.07, 3, 0.09), denim, 0, bodyY - h * 0.26, 0))
    for (const side of [-1, 1]) {
      const strap = mesh(new RoundedBoxGeometry(w * 0.17, h * 0.66, 0.05, 2, 0.02), denim, side * w * 0.24, bodyY + h * 0.18, d * 0.42)
      strap.rotation.x = -0.1
      body.add(strap)
    }
    body.add(mesh(new RoundedBoxGeometry(w * 0.3, h * 0.2, 0.04, 2, 0.02), matte('#a9cbe8'), 0, bodyY - h * 0.28, d * 0.55))
    return
  }

  if (species === 'bear') {
    // a knitted scarf, and the honey pot he is always carrying
    const scarf = matte('#e05a6d')
    const ring = mesh(new THREE.TorusGeometry(collarR, r * 0.18, 8, 20), scarf, 0, neckY, 0)
    ring.rotation.x = Math.PI / 2
    body.add(ring)
    const end = mesh(new RoundedBoxGeometry(r * 0.42, r * 1.0, r * 0.22, 2, 0.05), scarf, r * 0.42, neckY - r * 0.52, r * 0.44)
    end.rotation.z = 0.18
    body.add(end)
    const pot = mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.23, r * 0.36, 14), matte('#e8a33c'), -w * 0.56, bodyY - h * 0.3, d * 0.12)
    body.add(pot)
    body.add(mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.09, 14), matte('#fff6ec'), -w * 0.56, bodyY - h * 0.12, d * 0.12))
    return
  }

  if (species === 'penguin') {
    // bobble hat and scarf — penguins are always cold
    const cap = mesh(new THREE.SphereGeometry(r * 1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.53), matte('#7fc8d8'), 0, r * 0.34, 0)
    head.add(cap)
    const brim = mesh(new THREE.TorusGeometry(r * 0.98, r * 0.15, 8, 22), matte('#fff6ec'), 0, r * 0.36, 0)
    brim.rotation.x = Math.PI / 2
    head.add(brim)
    head.add(mesh(new THREE.SphereGeometry(r * 0.27, 12, 10), matte('#fff6ec'), 0, r * 1.48, 0))
    const scarf = matte('#f5d547')
    const ring = mesh(new THREE.TorusGeometry(collarR, r * 0.18, 8, 20), scarf, 0, neckY, 0)
    ring.rotation.x = Math.PI / 2
    body.add(ring)
    const end = mesh(new RoundedBoxGeometry(r * 0.4, r * 0.95, r * 0.22, 2, 0.05), scarf, r * 0.42, neckY - r * 0.5, r * 0.44)
    end.rotation.z = 0.2
    body.add(end)
    return
  }

  // puppy: a collar and a bandana
  const collar = mesh(new THREE.TorusGeometry(collarR, r * 0.12, 8, 20), matte('#7fc8d8'), 0, neckY, 0)
  collar.rotation.x = Math.PI / 2
  body.add(collar)
  const bandana = mesh(new THREE.ConeGeometry(r * 0.72, r * 0.9, 3), matte('#e05a6d'), 0, neckY - r * 0.5, r * 0.5)
  bandana.rotation.x = Math.PI
  bandana.rotation.y = Math.PI
  bandana.scale.set(1, 1, 0.32)
  body.add(bandana)
}

/** A paler version of a colour, for chests and bellies. */
function lighten(hex: string, amount = 0.3): string {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, Math.max(0, hsl.s - 0.12), Math.min(1, hsl.l + amount))
  return `#${c.getHexString()}`
}

/**
 * Shared idle/walk animation: leg swings, tail sway, ear wiggles, blinking.
 * walk is 0..1 (standing → full speed), walkPhase advances with distance.
 */
export function animateAnimal(rig: AnimalRig, time: number, walk: number, walkPhase: number): void {
  // legs
  const swing = 0.55 * walk + 0.0
  const s = Math.sin(walkPhase)
  rig.legFL.rotation.x = s * swing
  rig.legBR.rotation.x = s * swing
  rig.legFR.rotation.x = -s * swing
  rig.legBL.rotation.x = -s * swing

  // arms swing opposite the legs
  if (rig.armL && rig.armR) {
    rig.armL.rotation.x = -s * swing * 0.7
    rig.armR.rotation.x = s * swing * 0.7
  }

  // body bob
  rig.body.position.y = Math.abs(Math.sin(walkPhase)) * 0.045 * walk + Math.sin(time * 2.1) * 0.008

  // tail sway
  if (rig.tail) {
    rig.tail.rotation.y = Math.sin(time * 3.1 + 0.5) * (0.28 + walk * 0.35)
    rig.tail.rotation.x = (rig.species === 'kitten' ? 0.25 : 0) + Math.sin(time * 2.2) * 0.06
  }

  // ear wiggle
  const wiggle = Math.sin(time * 1.9) * 0.05 + Math.sin(time * 4.3) * 0.02
  if (rig.earL && rig.earR && rig.species !== 'puppy') {
    rig.earL.rotation.x = -0.12 + wiggle
    rig.earR.rotation.x = -0.12 - wiggle
  } else if (rig.earL && rig.earR) {
    rig.earL.rotation.z = 0.55 + Math.sin(time * 5.1) * 0.1 * (0.3 + walk)
    rig.earR.rotation.z = -0.55 - Math.sin(time * 5.1 + 1) * 0.1 * (0.3 + walk)
  }

  // blink
  if (time > rig.nextBlinkAt) {
    rig.blinkUntil = time + 0.13
    rig.nextBlinkAt = time + 2.2 + Math.random() * 3.5
  }
  const blinkScale = time < rig.blinkUntil ? 0.12 : 1
  for (const eye of rig.eyes) eye.scale.y = blinkScale
}
