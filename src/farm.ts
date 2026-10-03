import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PAL, matte } from './palette'
import type { Circle } from './colliders'
import type { Bump } from './world'

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export interface FarmAnimal {
  group: THREE.Group
  baseY: number
  phase: number
  kind: string
}

function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
  opts: { rx?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, matte(color))
  m.position.set(x, y, z)
  if (opts.rx) m.rotation.x = opts.rx
  if (opts.rz) m.rotation.z = opts.rz
  if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1)
  m.castShadow = true
  parent.add(m)
  return m
}

const sph = (r: number, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs)
const cyl = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 10)

function makeCow(g: THREE.Group, x: number, z: number, baseY: number, phase: number): FarmAnimal {
  const a = new THREE.Group()
  a.position.set(x, baseY, z)
  a.rotation.y = 0.5
  // body
  part(a, sph(0.52), '#fdfaf4', 0, 0.58, 0, { sy: 0.82, sz: 1.25 })
  // black patches
  part(a, sph(0.2), '#3d3a3a', 0.3, 0.72, 0.18)
  part(a, sph(0.16), '#3d3a3a', -0.34, 0.5, -0.2)
  part(a, sph(0.14), '#3d3a3a', 0.05, 0.42, -0.4)
  // head
  part(a, sph(0.3), '#fdfaf4', 0, 0.92, 0.6)
  part(a, sph(0.17), PAL.blush, 0, 0.82, 0.82, { sy: 0.7, sz: 0.8 }) // muzzle
  part(a, sph(0.06), '#3d3a3a', -0.12, 1.0, 0.78)
  part(a, sph(0.06), '#3d3a3a', 0.12, 1.0, 0.78)
  part(a, sph(0.1), '#fdfaf4', -0.3, 1.05, 0.5, { sx: 0.7 }) // ears
  part(a, sph(0.1), '#fdfaf4', 0.3, 1.05, 0.5, { sx: 0.7 })
  part(a, cyl(0.02, 0.045, 0.14), '#e8d5a8', -0.16, 1.14, 0.5, { rz: 0.3 }) // horns
  part(a, cyl(0.02, 0.045, 0.14), '#e8d5a8', 0.16, 1.14, 0.5, { rz: -0.3 })
  // legs + tail + udder
  for (const [lx, lz] of [[-0.28, 0.38], [0.28, 0.38], [-0.28, -0.38], [0.28, -0.38]] as [number, number][]) {
    part(a, cyl(0.09, 0.1, 0.4), '#fdfaf4', lx, 0.2, lz)
  }
  part(a, cyl(0.03, 0.03, 0.4), '#fdfaf4', 0, 0.55, -0.62, { rx: 0.5 })
  part(a, sph(0.13), PAL.blush, 0, 0.32, 0.3, { sy: 0.6 })
  g.add(a)
  return { group: a, baseY, phase, kind: 'cow' }
}

function makeHorse(g: THREE.Group, x: number, z: number, baseY: number, phase: number): FarmAnimal {
  const a = new THREE.Group()
  a.position.set(x, baseY, z)
  a.rotation.y = -0.6
  const body = '#a06a3a'
  const dark = '#6b4322'
  part(a, sph(0.5), body, 0, 0.82, 0, { sy: 0.95, sz: 1.45 })
  // neck + head
  const neck = part(a, cyl(0.16, 0.22, 0.62), body, 0, 1.28, 0.52)
  neck.rotation.x = -0.5
  part(a, sph(0.19), body, 0, 1.62, 0.78)
  part(a, sph(0.13), body, 0, 1.56, 0.98, { sz: 1.4 }) // muzzle
  part(a, sph(0.05), '#3d3a3a', -0.09, 1.68, 0.78)
  part(a, sph(0.05), '#3d3a3a', 0.09, 1.68, 0.78)
  part(a, cyl(0.02, 0.05, 0.16), dark, -0.1, 1.8, 0.72, { rz: 0.25 })
  part(a, cyl(0.02, 0.05, 0.16), dark, 0.1, 1.8, 0.72, { rz: -0.25 })
  // mane
  for (let i = 0; i < 4; i++) {
    part(a, sph(0.07), dark, 0, 1.32 + i * 0.11, 0.56 - i * 0.09)
  }
  // tail
  part(a, cyl(0.05, 0.09, 0.55), dark, 0, 0.72, -0.72, { rx: 0.45 })
  // legs
  for (const [lx, lz] of [[-0.24, 0.5], [0.24, 0.5], [-0.24, -0.5], [0.24, -0.5]] as [number, number][]) {
    part(a, cyl(0.07, 0.08, 0.62), dark, lx, 0.31, lz)
  }
  g.add(a)
  return { group: a, baseY, phase, kind: 'horse' }
}

function makeLlama(g: THREE.Group, x: number, z: number, baseY: number, phase: number): FarmAnimal {
  const a = new THREE.Group()
  a.position.set(x, baseY, z)
  a.rotation.y = 2.6
  const wool = '#fdf6ec'
  part(a, sph(0.42), wool, 0, 0.72, 0, { sy: 0.9, sz: 1.25 })
  // fluffy bumps
  part(a, sph(0.16), wool, 0.22, 0.98, -0.1)
  part(a, sph(0.14), wool, -0.2, 0.94, 0.14)
  // neck + head
  part(a, cyl(0.13, 0.17, 0.72), wool, 0, 1.3, 0.42)
  part(a, sph(0.16), wool, 0, 1.68, 0.5)
  part(a, cyl(0.05, 0.06, 0.22), wool, 0, 1.62, 0.66, { rx: 1.2 }) // snout
  part(a, sph(0.04), '#3d3a3a', -0.08, 1.74, 0.5)
  part(a, sph(0.04), '#3d3a3a', 0.08, 1.74, 0.5)
  // banana ears
  part(a, cyl(0.02, 0.04, 0.18), wool, -0.09, 1.88, 0.44, { rx: 0.3, rz: 0.35 })
  part(a, cyl(0.02, 0.04, 0.18), wool, 0.09, 1.88, 0.44, { rx: 0.3, rz: -0.35 })
  // pink blanket
  part(a, sph(0.3), PAL.blossomPink, 0, 0.94, 0.02, { sy: 0.28, sz: 1.05 })
  // legs
  for (const [lx, lz] of [[-0.18, 0.34], [0.18, 0.34], [-0.18, -0.34], [0.18, -0.34]] as [number, number][]) {
    part(a, cyl(0.06, 0.07, 0.56), wool, lx, 0.28, lz)
  }
  g.add(a)
  return { group: a, baseY, phase, kind: 'llama' }
}

function makeChicken(g: THREE.Group, x: number, z: number, baseY: number, phase: number): FarmAnimal {
  const a = new THREE.Group()
  a.position.set(x, baseY, z)
  a.rotation.y = -2.2
  part(a, sph(0.22), '#fffdf6', 0, 0.26, 0, { sy: 1.1, sz: 1.2 })
  part(a, sph(0.12), '#fffdf6', 0, 0.46, 0.1) // head
  part(a, sph(0.045), '#e05a6d', 0, 0.58, 0.08) // comb
  part(a, sph(0.035), '#e05a6d', 0, 0.5, 0.16) // wattle
  part(a, sph(0.04), '#f6b352', 0, 0.46, 0.2, { sz: 1.6 }) // beak
  part(a, sph(0.04), '#3d3a3a', -0.06, 0.49, 0.16)
  part(a, sph(0.04), '#3d3a3a', 0.06, 0.49, 0.16)
  part(a, sph(0.11), '#f0e8d8', 0, 0.34, -0.2, { sx: 1.2, sz: 0.6 }) // tail puff
  part(a, cyl(0.02, 0.02, 0.12), '#f6b352', -0.07, 0.06, 0.04)
  part(a, cyl(0.02, 0.02, 0.12), '#f6b352', 0.07, 0.06, 0.04)
  g.add(a)
  return { group: a, baseY, phase, kind: 'chicken' }
}

/** Fenced mini farm with a barn, hay and four cute residents. */
export function buildFarm(g: THREE.Group, colliders: Circle[], _bumps: Bump[], cx: number, cz: number): FarmAnimal[] {
  const animals: FarmAnimal[] = []
  const x0 = cx - 3.5
  const x1 = cx + 3.5
  const z0 = cz - 2.6
  const z1 = cz + 2.6
  const gateHalf = 0.7

  // fence (gate gap in the west rail)
  const post = (x: number, z: number) => g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.72, 8), matte(PAL.logDark), x, 0.36, z))
  for (let x = x0; x <= x1 + 0.01; x += 1.4) {
    post(x, z0)
    post(x, z1)
  }
  for (let z = z0; z <= z1 + 0.01; z += 1.3) {
    post(x0, z)
    post(x1, z)
  }
  for (const zz of [z0, z1]) {
    for (const y of [0.28, 0.56]) {
      g.add(mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 0.05), matte(PAL.log), (x0 + x1) / 2, y, zz))
    }
  }
  for (const xx of [x0, x1]) {
    const gapA = cz - gateHalf
    const gapB = cz + gateHalf
    for (const [za, zb] of [[z0, gapA], [gapB, z1]] as [number, number][]) {
      for (const y of [0.28, 0.56]) {
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.06, zb - za), matte(PAL.log), xx, y, (za + zb) / 2))
      }
    }
  }
  colliders.push({ x: x0, z: cz - 1.6, r: 0.15 })
  colliders.push({ x: x0, z: cz + 1.6, r: 0.15 })
  colliders.push({ x: x1, z: cz, r: 0.15 })

  // barn
  const barn = new THREE.Group()
  barn.position.set(cx + 2.4, 0, cz - 1.6)
  barn.add(mesh(new RoundedBoxGeometry(2.6, 1.7, 2.2, 3, 0.12), matte(PAL.barnRed), 0, 0.85, 0))
  const roof = mesh(new THREE.CylinderGeometry(1.85, 1.85, 2.7, 3, 1), matte('#b05050', { flat: true }), 0, 1.7, 0)
  roof.rotation.z = Math.PI / 2
  roof.rotation.y = Math.PI / 2
  roof.scale.set(1, 1, 0.62)
  roof.castShadow = true
  barn.add(roof)
  barn.add(mesh(new RoundedBoxGeometry(0.8, 1.0, 0.08, 2, 0.06), matte('#fff6ec'), 0, 0.5, 1.12))
  barn.add(mesh(new THREE.BoxGeometry(0.66, 0.07, 0.02), matte(PAL.barnRed), 0, 0.5, 1.17))
  barn.add(mesh(new THREE.BoxGeometry(0.07, 0.94, 0.02), matte(PAL.barnRed), 0, 0.5, 1.17))
  g.add(barn)
  colliders.push({ x: cx + 2.4, z: cz - 1.6, r: 1.5 })

  // hay bales
  for (const [hx, hz, ry] of [[cx - 2.6, cz - 1.7, 0.4], [cx - 1.9, cz - 1.9, 1.1]] as [number, number, number][]) {
    const hay = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.72, 12), matte(PAL.hay), hx, 0.36, hz)
    hay.rotation.z = Math.PI / 2
    hay.rotation.y = ry
    g.add(hay)
  }
  colliders.push({ x: cx - 2.6, z: cz - 1.7, r: 0.5 })

  // residents
  animals.push(makeCow(g, cx - 1.2, cz + 0.6, 0, 0))
  animals.push(makeHorse(g, cx + 1.4, cz + 0.9, 0, 1.7))
  animals.push(makeLlama(g, cx - 0.9, cz - 1.1, 0, 3.1))
  animals.push(makeChicken(g, cx + 2.2, cz + 0.2, 0, 4.4))

  colliders.push({ x: cx - 1.2, z: cz + 0.6, r: 0.55 })
  colliders.push({ x: cx + 1.4, z: cz + 0.9, r: 0.55 })
  colliders.push({ x: cx - 0.9, z: cz - 1.1, r: 0.5 })
  colliders.push({ x: cx + 2.2, z: cz + 0.2, r: 0.3 })

  return animals
}
