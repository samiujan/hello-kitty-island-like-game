import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PAL, matte } from './palette'
import type { Circle } from './colliders'

export interface Interior {
  name: string
  group: THREE.Group
  colliders: Circle[]
  spawn: THREE.Vector3
  spawnFacing: number
  doorAnchor: THREE.Vector3
  spinners: THREE.Mesh[]
  /** One entry per wall: the game hides walls the camera looks from behind. */
  walls: WallPanel[]
  /** Optional story interaction inside the room (the museum egg). */
  focus?: { name: string; pos: THREE.Vector3; range: number; mesh?: THREE.Object3D }
}

export interface WallPanel {
  group: THREE.Group
  normal: THREE.Vector3 // outward direction of the wall
  center: THREE.Vector3
}

const ROOM_W = 9.6
const ROOM_D = 7.6
const DOOR_W = 1.7

/** Wall material with a slight emissive so inner faces stay pastel. */
function wallMat(color: string): THREE.MeshStandardMaterial {
  const m = matte(color).clone()
  m.emissive = new THREE.Color(color)
  m.emissiveIntensity = 0.3
  return m
}

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  receive = true,
  cast = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.06, h / 3)), mat)
  m.position.set(x, y, z)
  m.receiveShadow = receive
  m.castShadow = cast
  parent.add(m)
  return m
}

/** A wall is a chain of circle colliders the kitten can't slip through. */
function wallChain(colliders: Circle[], x1: number, z1: number, x2: number, z2: number, r = 0.42): void {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz)
  const n = Math.max(1, Math.round(len / 0.55))
  for (let i = 0; i <= n; i++) {
    colliders.push({ x: x1 + (dx * i) / n, z: z1 + (dz * i) / n, r })
  }
}

function makeCheckerTexture(a: string, b: string, n = 8): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const cell = canvas.width / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? a : b
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

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

function makeMenuTexture(title: string, lines: string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 384
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const draw = () => {
    ctx.fillStyle = '#fff8ee'
    ctx.beginPath()
    ctx.roundRect(10, 10, 492, 364, 40)
    ctx.fill()
    ctx.lineWidth = 12
    ctx.strokeStyle = '#e8b287'
    ctx.beginPath()
    ctx.roundRect(10, 10, 492, 364, 40)
    ctx.stroke()
    ctx.fillStyle = '#6b4d43'
    ctx.textAlign = 'center'
    ctx.font = '800 72px "Baloo 2", system-ui, sans-serif'
    ctx.fillText(title, 256, 96)
    ctx.font = '600 42px "Baloo 2", system-ui, sans-serif'
    lines.forEach((line, i) => {
      ctx.fillText(line, 256, 180 + i * 58)
    })
    tex.needsUpdate = true
  }
  draw()
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(draw).catch(() => {})
  }
  return tex
}

interface ShellColors {
  wall: string
  wainscot: string
  floor: string
  mat: string
  /** Optional custom floor material (e.g. checkerboard) used instead of `floor`. */
  floorMat?: THREE.Material
}

export interface Shell {
  walls: WallPanel[]
  back: THREE.Group
  left: THREE.Group
  right: THREE.Group
  front: THREE.Group
}

const WALL_H = 3.0

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const sph = (r: number, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs)

/** Room shell: floor + four wall groups, each tagged with its outward normal so
 *  the game can hide whichever walls sit between the camera and the room. */
function buildShell(g: THREE.Group, colliders: Circle[], c: ShellColors): Shell {
  const mat = wallMat(c.wall)
  const wain = matte(c.wainscot)
  const walls: WallPanel[] = []
  const segW = (ROOM_W - DOOR_W) / 2

  const makeWall = (normal: THREE.Vector3, build: (grp: THREE.Group) => void): { group: THREE.Group; panel: WallPanel } => {
    const grp = new THREE.Group()
    build(grp)
    g.add(grp)
    const panel: WallPanel = { group: grp, normal, center: normal.clone().multiplyScalar(0) }
    // wall center = normal * (half depth/width of the room) at wall mid-height
    panel.center.set(normal.x * (ROOM_W / 2), WALL_H / 2, normal.z * (ROOM_D / 2))
    walls.push(panel)
    return { group: grp, panel }
  }

  // back wall (normal -Z)
  makeWall(new THREE.Vector3(0, 0, -1), (grp) => {
    box(grp, ROOM_W, WALL_H, 0.3, mat, 0, WALL_H / 2, -ROOM_D / 2)
    box(grp, ROOM_W - 0.8, 0.7, 0.08, wain, 0, 0.35, -ROOM_D / 2 + 0.24, true, false)
  })
  // left wall (normal -X)
  makeWall(new THREE.Vector3(-1, 0, 0), (grp) => {
    box(grp, 0.3, WALL_H, ROOM_D, mat, -ROOM_W / 2, WALL_H / 2, 0)
    box(grp, 0.08, 0.7, ROOM_D - 0.8, wain, -ROOM_W / 2 + 0.24, 0.35, 0, true, false)
  })
  // right wall (normal +X)
  makeWall(new THREE.Vector3(1, 0, 0), (grp) => {
    box(grp, 0.3, WALL_H, ROOM_D, mat, ROOM_W / 2, WALL_H / 2, 0)
    box(grp, 0.08, 0.7, ROOM_D - 0.8, wain, ROOM_W / 2 - 0.24, 0.35, 0, true, false)
  })
  // front wall (normal +Z): two segments + header above the door
  const front = makeWall(new THREE.Vector3(0, 0, 1), (grp) => {
    box(grp, segW, WALL_H, 0.3, mat, -(DOOR_W / 2 + segW / 2), WALL_H / 2, ROOM_D / 2)
    box(grp, segW, WALL_H, 0.3, mat, DOOR_W / 2 + segW / 2, WALL_H / 2, ROOM_D / 2)
    box(grp, DOOR_W + 0.3, WALL_H - 2.25, 0.3, mat, 0, 2.25 + (WALL_H - 2.25) / 2, ROOM_D / 2)
    box(grp, segW - 0.3, 0.7, 0.08, wain, -(DOOR_W / 2 + segW / 2), 0.35, ROOM_D / 2 - 0.24, true, false)
    box(grp, segW - 0.3, 0.7, 0.08, wain, DOOR_W / 2 + segW / 2, 0.35, ROOM_D / 2 - 0.24, true, false)
  })

  // floor (always visible) — a single floor surface so nothing z-fights
  box(g, ROOM_W + 0.4, 0.24, ROOM_D + 0.4, c.floorMat ?? matte(c.floor), 0, -0.12, 0, true, false)
  // door mat
  box(g, 1.5, 0.05, 0.75, matte(c.mat), 0, 0.05, ROOM_D / 2 - 0.7, true, false)

  wallChain(colliders, -ROOM_W / 2, -ROOM_D / 2, ROOM_W / 2, -ROOM_D / 2)
  wallChain(colliders, -ROOM_W / 2, -ROOM_D / 2, -ROOM_W / 2, ROOM_D / 2)
  wallChain(colliders, ROOM_W / 2, -ROOM_D / 2, ROOM_W / 2, ROOM_D / 2)
  wallChain(colliders, -ROOM_W / 2, ROOM_D / 2, -DOOR_W / 2 - 0.2, ROOM_D / 2)
  wallChain(colliders, DOOR_W / 2 + 0.2, ROOM_D / 2, ROOM_W / 2, ROOM_D / 2)

  return {
    walls,
    back: walls[0].group,
    left: walls[1].group,
    right: walls[2].group,
    front: front.group,
  }
}

function makeTable(g: THREE.Group, x: number, z: number, topColor: string): void {
  box(g, 0.16, 0.7, 0.16, matte(PAL.logDark), x, 0.35, z)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.09, 22), matte(topColor))
  top.position.set(x, 0.76, z)
  top.castShadow = true
  top.receiveShadow = true
  g.add(top)
  for (const [sx, sz] of [[0.85, 0.25], [-0.3, 0.95]] as [number, number][]) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.42, 14), matte(topColor))
    stool.position.set(x + sx, 0.21, z + sz)
    stool.castShadow = true
    g.add(stool)
  }
}

// ---------------------------------------------------------------- ice cream

function buildIceCreamInterior(): Interior {
  const g = new THREE.Group()
  const colliders: Circle[] = []
  const shell = buildShell(g, colliders, { wall: '#ffeef5', wainscot: PAL.hutPink, floor: '#fff4e0', mat: PAL.blossomPink })

  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.04, 28), matte(PAL.blossomPink))
  rug.position.set(-0.7, 0.05, 0.7)
  rug.receiveShadow = true
  g.add(rug)
  const rugIn = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.045, 28), matte('#ffd9e6'))
  rugIn.position.set(-0.7, 0.095, 0.7)
  rugIn.receiveShadow = true
  g.add(rugIn)

  // counter + display
  box(g, 4.3, 1.05, 0.9, matte(PAL.hutPink), -1.7, 0.55, -2.85)
  box(g, 4.6, 0.12, 1.15, matte('#fff8ee'), -1.7, 1.16, -2.85)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.78, 0.85),
    new THREE.MeshStandardMaterial({ color: '#dff2fb', transparent: true, opacity: 0.28, roughness: 0.15 }),
  )
  glass.position.set(-2.3, 1.62, -2.85)
  g.add(glass)
  const sweets = ['#f7b8cf', '#fff6ec', '#b8e8d0', '#f5d547', '#c9a6e8']
  sweets.forEach((col, i) => {
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.16, 12), matte(col))
    cake.position.set(-3.3 + i * 0.5, 1.45, -2.85)
    cake.castShadow = true
    g.add(cake)
  })
  const tubs: [string, string][] = [['#b8e8d0', '#e8fbf2'], ['#f7b8cf', '#ffe3ee'], ['#f5d547', '#fdf3c0']]
  tubs.forEach(([col, lid], i) => {
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.34, 16), matte(col))
    tub.position.set(-0.2 + i * 0.66, 1.39, -2.85)
    tub.castShadow = true
    g.add(tub)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 16), matte(lid))
    top.position.set(-0.2 + i * 0.66, 1.58, -2.85)
    g.add(top)
  })

  // menu board on the back wall
  const menu = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 2.4),
    new THREE.MeshBasicMaterial({ map: makeMenuTexture('Ice Cream', ['Strawberry · 3', 'Vanilla · 3', 'Mint Chip · 4', 'Rainbow · 5']), transparent: true }),
  )
  menu.position.set(2.4, 1.95, -ROOM_D / 2 + 0.22)
  shell.back.add(menu)

  // garland of pastel dots across the back wall
  const dotColors = [PAL.blossomPink, PAL.flowerYellow, '#b8e8d0', PAL.blossomPurple, PAL.blossomPink]
  dotColors.forEach((col, i) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), matte(col))
    dot.position.set(-4 + i * 0.75, 2.85, -ROOM_D / 2 + 0.24)
    shell.back.add(dot)
  })

  makeTable(g, 2.2, 0.9, PAL.hutPurple)
  makeTable(g, 0.1, 2.1, PAL.blossomPink)

  // window on the left wall
  box(shell.left, 0.1, 1.5, 1.9, matte('#fff8ee'), -ROOM_W / 2 + 0.26, 1.8, -0.6, true, false)
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), new THREE.MeshBasicMaterial({ color: PAL.skyTop }))
  winGlass.rotation.y = Math.PI / 2
  winGlass.position.set(-ROOM_W / 2 + 0.22, 1.8, -0.6)
  shell.left.add(winGlass)

  colliders.push({ x: -1.7, z: -2.85, r: 2.3 })
  colliders.push({ x: 2.2, z: 0.9, r: 0.62 })
  colliders.push({ x: 0.1, z: 2.1, r: 0.62 })

  return {
    name: 'Ice Cream Shop',
    group: g,
    colliders,
    spawn: new THREE.Vector3(0, 0, 1.3),
    spawnFacing: Math.PI,
    doorAnchor: new THREE.Vector3(0, 2.0, ROOM_D / 2 - 0.2),
    spinners: [],
    walls: shell.walls,
  }
}

// ---------------------------------------------------------------- barber

function buildBarberChair(g: THREE.Group, colliders: Circle[], x: number, z: number, rot: number): void {
  const chair = new THREE.Group()
  chair.position.set(x, 0, z)
  chair.rotation.y = rot
  const red = matte('#e05a6d')
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 18), matte(PAL.logDark))
  base.position.y = 0.08
  base.castShadow = true
  chair.add(base)
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 12), matte(PAL.flowerYellow))
  column.position.y = 0.3
  chair.add(column)
  box(chair, 0.95, 0.24, 0.9, red, 0, 0.56, 0)
  const back = box(chair, 0.9, 1.05, 0.2, red, 0, 1.15, -0.42)
  back.rotation.x = -0.12
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), red)
  head.position.set(0, 1.72, -0.5)
  head.castShadow = true
  chair.add(head)
  box(chair, 0.16, 0.14, 0.75, red, -0.55, 0.86, 0.02)
  box(chair, 0.16, 0.14, 0.75, red, 0.55, 0.86, 0.02)
  box(chair, 0.7, 0.1, 0.2, matte('#5a4438'), 0, 0.5, 0.62)
  g.add(chair)
  colliders.push({ x, z, r: 0.85 })
}

function buildBarberInterior(): Interior {
  const g = new THREE.Group()
  const colliders: Circle[] = []

  // checkered floor passed to the shell (single floor surface — no z-fighting)
  const floorMat = new THREE.MeshStandardMaterial({ map: makeCheckerTexture('#f6fbff', '#cfe4f2', 8), roughness: 0.9 })
  const shell = buildShell(g, colliders, { wall: '#eef6fc', wainscot: '#7fb3d8', floor: '#f6fbff', mat: '#bcd9ec', floorMat })

  buildBarberChair(g, colliders, -0.8, -1.0, 0.25)

  // mirror stations with scissors + comb on the shelf
  for (const mx of [-2.6, 1.4]) {
    box(shell.back, 1.2, 1.6, 0.1, matte('#fff8ee'), mx, 1.95, -ROOM_D / 2 + 0.25, true, false)
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.35),
      new THREE.MeshStandardMaterial({ color: '#cfe8f5', roughness: 0.15, emissive: '#9cc8e0', emissiveIntensity: 0.25 }),
    )
    glass.position.set(mx, 1.95, -ROOM_D / 2 + 0.32)
    shell.back.add(glass)
    box(shell.back, 1.0, 0.07, 0.3, matte(PAL.log), mx, 1.05, -ROOM_D / 2 + 0.42, true, false)

    const steel = new THREE.MeshStandardMaterial({ color: '#9aa8b8', roughness: 0.3, metalness: 0.7 })
    const scissors = new THREE.Group()
    scissors.position.set(mx - 0.2, 1.24, -ROOM_D / 2 + 0.42)
    for (const ang of [0.3, -0.3]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.02), steel)
      blade.rotation.z = ang
      scissors.add(blade)
    }
    for (const sx of [-0.09, 0.09]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 14), steel)
      ring.position.set(sx, -0.2, 0)
      ring.rotation.x = 0.2
      scissors.add(ring)
    }
    shell.back.add(scissors)

    const comb = new THREE.Group()
    comb.position.set(mx + 0.22, 1.15, -ROOM_D / 2 + 0.42)
    comb.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.03), matte(PAL.hutPurple)))
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.09, 0.02), matte(PAL.hutPurple))
      tooth.position.set(-0.13 + i * 0.038, -0.07, 0)
      comb.add(tooth)
    }
    shell.back.add(comb)
  }

  // waiting bench
  box(g, 0.62, 0.4, 2.3, matte(PAL.log), ROOM_W / 2 - 0.75, 0.28, -0.4)
  box(g, 0.68, 0.12, 2.36, matte('#e05a6d'), ROOM_W / 2 - 0.75, 0.54, -0.4)
  colliders.push({ x: ROOM_W / 2 - 0.75, z: -0.4, r: 0.7 })

  // service counter + register
  box(g, 1.5, 0.95, 0.7, matte('#fff8ee'), 2.6, 0.5, -2.85)
  box(g, 0.42, 0.34, 0.36, matte('#5a4438'), 2.6, 1.16, -2.85)
  colliders.push({ x: 2.6, z: -2.85, r: 0.85 })

  // rug under the chair
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.04, 24), matte('#bcd9ec'))
  rug.position.set(-0.8, 0.05, -1.0)
  rug.receiveShadow = true
  g.add(rug)

  // spinning pole by the door
  const stripes = makeStripeTexture()
  stripes.repeat.set(2, 1)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.58, 14),
    new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }),
  )
  shaft.position.set(2.4, 0.7, 2.6)
  shaft.castShadow = true
  g.add(shaft)
  for (const cy of [0.37, 1.03]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), matte(PAL.flowerYellow))
    cap.position.set(2.4, cy, 2.6)
    g.add(cap)
  }
  const pbase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.13, 14), matte(PAL.logDark))
  pbase.position.set(2.4, 0.065, 2.6)
  g.add(pbase)
  colliders.push({ x: 2.4, z: 2.6, r: 0.2 })

  return {
    name: 'Barber Shop',
    group: g,
    colliders,
    spawn: new THREE.Vector3(0, 0, 1.3),
    spawnFacing: Math.PI,
    doorAnchor: new THREE.Vector3(0, 2.0, ROOM_D / 2 - 0.2),
    spinners: [shaft],
    walls: shell.walls,
  }
}

// ---------------------------------------------------------------- slushie

function buildSlushieInterior(): Interior {
  const g = new THREE.Group()
  const colliders: Circle[] = []
  const shell = buildShell(g, colliders, { wall: '#e8f4fc', wainscot: '#6f9fd8', floor: '#eef7ff', mat: '#bcd9ec' })

  // counter with three slushie machines
  box(g, 4.4, 1.0, 0.9, matte('#fff8ee'), -1.6, 0.55, -2.85)
  box(g, 4.7, 0.12, 1.1, matte('#6f9fd8'), -1.6, 1.11, -2.85)
  const flavors: [string, string][] = [
    ['#7fc8f0', '#4a9fd8'],
    ['#f7a8c8', '#e878a8'],
    ['#b8e8b0', '#78c870'],
  ]
  flavors.forEach(([juice, base], i) => {
    const mx = -2.5 + i * 1.15
    box(g, 0.55, 0.55, 0.5, matte(base), mx, 1.45, -2.9)
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.16, 0.5, 14),
      new THREE.MeshStandardMaterial({ color: juice, transparent: true, opacity: 0.85, roughness: 0.25 }),
    )
    bowl.position.set(mx, 2.0, -2.9)
    g.add(bowl)
    box(g, 0.28, 0.07, 0.28, matte('#fff8ee'), mx, 2.28, -2.9)
  })
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 10), matte('#fff8ee'))
    cup.position.set(0.6 + i * 0.26, 1.28, -2.75)
    g.add(cup)
  }

  // menu on the back wall
  const menu = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 2.4),
    new THREE.MeshBasicMaterial({ map: makeMenuTexture('Slushies', ['Blue Raspberry · 4', 'Strawberry · 4', 'Mango · 5', 'Mystery · 3']), transparent: true }),
  )
  menu.position.set(2.4, 1.95, -ROOM_D / 2 + 0.22)
  shell.back.add(menu)

  // snowflake dots
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), matte('#ffffff'))
    dot.position.set(-4 + i * 0.8, 2.8, -ROOM_D / 2 + 0.24)
    shell.back.add(dot)
  }

  // freezer chest
  box(g, 1.0, 0.8, 1.9, matte('#fff8ee'), ROOM_W / 2 - 0.75, 0.4, -0.6)
  box(g, 1.06, 0.1, 1.96, matte('#6f9fd8'), ROOM_W / 2 - 0.75, 0.85, -0.6)
  colliders.push({ x: ROOM_W / 2 - 0.75, z: -0.6, r: 0.7 })

  makeTable(g, 2.0, 1.4, '#6f9fd8')

  colliders.push({ x: -1.6, z: -2.85, r: 2.3 })
  colliders.push({ x: 2.0, z: 1.4, r: 0.62 })

  return {
    name: 'Slushie Shop',
    group: g,
    colliders,
    spawn: new THREE.Vector3(0, 0, 1.3),
    spawnFacing: Math.PI,
    doorAnchor: new THREE.Vector3(0, 2.0, ROOM_D / 2 - 0.2),
    spinners: [],
    walls: shell.walls,
  }
}

// ---------------------------------------------------------------- museum

function buildMuseumInterior(): Interior {
  const g = new THREE.Group()
  const colliders: Circle[] = []
  const shell = buildShell(g, colliders, { wall: '#fff7e2', wainscot: '#d8a94e', floor: '#fffdf2', mat: '#f2e3b8' })

  const bone = matte(PAL.bone)

  // centerpiece platform
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.45, 0.16, 30), matte('#efe0c2'))
  platform.position.set(0, 0.08, -0.6)
  platform.receiveShadow = true
  g.add(platform)

  // cute dino skeleton
  const dino = new THREE.Group()
  dino.position.set(0, 0.16, -0.6)
  // spine arc
  const spinePts: THREE.Vector3[] = []
  for (let i = 0; i < 8; i++) {
    const t = i / 7
    const p = new THREE.Vector3(0, 0.75 + Math.sin(t * 1.2) * 0.85, 0.95 - t * 1.9)
    spinePts.push(p)
    dino.add(new THREE.Mesh(sph(0.13, 10, 8), bone).translateX(p.x).translateY(p.y).translateZ(p.z))
  }
  // ribs
  for (const idx of [1, 2, 3, 4]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 18, Math.PI), bone)
    rib.position.copy(spinePts[idx])
    rib.rotation.y = Math.PI / 2
    dino.add(rib)
  }
  // skull with big eye sockets
  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.44, 0.55, 3, 0.14), bone)
  skull.position.set(0, spinePts[0].y + 0.28, spinePts[0].z + 0.15)
  skull.castShadow = true
  dino.add(skull)
  const snout = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.22, 0.42, 3, 0.1), bone)
  snout.position.set(0, skull.position.y - 0.1, skull.position.z + 0.32)
  dino.add(snout)
  for (const ex of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), matte('#4a3b32'))
    eye.position.set(ex, skull.position.y + 0.08, skull.position.z + 0.2)
    dino.add(eye)
  }
  // legs + tail + tiny arms
  for (const lx of [-0.55, 0.55]) {
    const legTop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.55, 10), bone)
    legTop.position.set(lx, 0.55, 0.1)
    legTop.rotation.z = lx > 0 ? -0.15 : 0.15
    dino.add(legTop)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bone)
    foot.position.set(lx, 0.1, 0.16)
    foot.scale.set(1, 0.6, 1.5)
    dino.add(foot)
  }
  for (let i = 0; i < 4; i++) {
    const tailBone = new THREE.Mesh(sph(0.1 - i * 0.015, 10, 8), bone)
    tailBone.position.set(0, 0.5 - i * 0.09, -1.15 - i * 0.3)
    dino.add(tailBone)
  }
  for (const ax of [-0.3, 0.3]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), bone)
    arm.position.set(ax, 0.95, 0.75)
    arm.rotation.x = 0.9
    dino.add(arm)
  }
  g.add(dino)

  // rope posts around the platform
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const px = Math.cos(a) * 2.75
    const pz = -0.6 + Math.sin(a) * 2.75
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 8), matte(PAL.logDark), px, 0.3, pz))
    if (i > 0) {
      const prevA = ((i - 1) / 6) * Math.PI * 2 + 0.3
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.38, 6),
        matte(PAL.hay),
      )
      rope.rotation.z = Math.PI / 2
      rope.position.set((Math.cos(prevA) + Math.cos(a)) / 2 * 2.75, 0.48, -0.6 + (Math.sin(prevA) + Math.sin(a)) / 2 * 2.75)
      rope.rotation.y = -(a + prevA) / 2 + Math.PI / 2
      g.add(rope)
    }
  }

  // side exhibits: dino egg + footprint slab
  const pedestal = (px: number, pz: number) => {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.7, 14), matte('#e8d5a8'))
    ped.position.set(px, 0.35, pz)
    ped.castShadow = true
    g.add(ped)
  }
  pedestal(3.4, 1.8)
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), matte('#f6f0e0'))
  egg.position.set(3.4, 0.95, 1.8)
  egg.scale.y = 1.3
  egg.castShadow = true
  g.add(egg)
  const slab = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.14, 1.1, 3, 0.05), matte('#b8c4cf'))
  slab.position.set(-3.3, 0.35, 1.9)
  slab.receiveShadow = true
  g.add(slab)
  for (let i = 0; i < 3; i++) {
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), matte('#8a97a4'))
    toe.position.set(-3.45 + i * 0.16, 0.44, 1.75)
    g.add(toe)
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), matte('#8a97a4'))
    pad.position.set(-3.37 + i * 0.16, 0.44, 1.95)
    g.add(pad)
  }

  colliders.push({ x: 0, z: -0.6, r: 2.4 })
  colliders.push({ x: 3.4, z: 1.8, r: 0.45 })
  colliders.push({ x: -3.3, z: 1.9, r: 0.7 })

  return {
    name: 'Museum',
    group: g,
    colliders,
    spawn: new THREE.Vector3(0, 0, 1.3),
    spawnFacing: Math.PI,
    doorAnchor: new THREE.Vector3(0, 2.0, ROOM_D / 2 - 0.2),
    spinners: [],
    walls: shell.walls,
    // the story's egg — the game wobbles it and lets the kitten interact
    focus: { name: 'look at the egg', pos: new THREE.Vector3(3.4, 0, 1.8), range: 2.6, mesh: egg },
  }
}

export function buildInteriors(): { iceCream: Interior; barber: Interior; slushie: Interior; museum: Interior } {
  const iceCream = buildIceCreamInterior()
  const barber = buildBarberInterior()
  const slushie = buildSlushieInterior()
  const museum = buildMuseumInterior()
  iceCream.group.visible = false
  barber.group.visible = false
  slushie.group.visible = false
  museum.group.visible = false
  return { iceCream, barber, slushie, museum }
}
