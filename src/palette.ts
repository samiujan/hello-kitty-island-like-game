import * as THREE from 'three'

/** Pastel palette — white-ground village under a blue Ghibli sky. */
export const PAL = {
  // terrain (white world)
  sand: '#f7f3ec',
  sandDeep: '#eae4da',
  dirt: '#9aa8c2',
  grass: '#7cbf4e',
  grassDeep: '#5e9e3c',
  grassLight: '#8fd15e',
  // paths & plaza
  plank: '#c97b54',
  plankDark: '#a05a3e',
  stone: '#ddbac8',
  stoneDark: '#cba3b4',
  log: '#c99a5e',
  logDark: '#b3814a',
  // props
  rock: '#aab6cf',
  rockDark: '#98a5c0',
  hutPink: '#e86ca0',
  hutPurple: '#b060c0',
  awning: '#f2c14e',
  roof: '#dd6fc6',
  // plants
  blossomPink: '#f7b8cf',
  blossomPurple: '#c9a6e8',
  flowerYellow: '#f5d547',
  flowerWhite: '#fff6ec',
  leafDeep: '#5fae52',
  water: '#a3d3ec',
  // animals
  cream: '#fff4e0',
  peach: '#ffb570',
  blush: '#ffa8b8',
  earPink: '#ffb3c6',
  ink: '#4a3b32',
  white: '#ffffff',
  bunny: '#fdf3f7',
  bear: '#d9a066',
  bearMuzzle: '#f5dfc0',
  penguin: '#5f6f8f',
  penguinBelly: '#fdf6ee',
  beak: '#f6b352',
  puppy: '#e8b98a',
  puppyPatch: '#c98a5b',
  // atmosphere (blue sky)
  sky: '#dff0fa',
  skyTop: '#6fb5ea',
  skyMid: '#b7dcf5',
  skyLow: '#e8f4fb',
  cloud: '#fffdfa',
  // beach & resort
  beach: '#f0dca8',
  beachDeep: '#e3cc96',
  lagoon: '#9fd4ec',
  foam: '#eaf7fc',
  barnRed: '#d96a6a',
  hay: '#e8c96a',
  bone: '#f3ead6',
} as const

const materialCache = new Map<string, THREE.MeshStandardMaterial>()

export interface MatteOptions {
  roughness?: number
  emissive?: string
  emissiveIntensity?: number
  flat?: boolean
}

/**
 * Soft matte material factory (cached per color so props share materials).
 * This "toy plastic" look is what gives the pastel, rounded feel.
 */
export function matte(color: string, opts: MatteOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.roughness ?? 0.9}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}|${opts.flat ? 'f' : ''}`
  let m = materialCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.roughness ?? 0.9,
      metalness: 0,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color('#000000'),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      flatShading: opts.flat ?? false,
    })
    materialCache.set(key, m)
  }
  return m
}

/** Glossy material for eyes / noses — tiny specular sparkle. */
export function glossy(color: string): THREE.MeshStandardMaterial {
  const key = `glossy|${color}`
  let m = materialCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.25,
      metalness: 0,
    })
  }
  return m
}

/** Slight hue/lightness jitter for hand-placed variety (planks, stones, bushes). */
export function jitterColor(base: string, amount = 0.035): THREE.Color {
  const c = new THREE.Color(base)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(
    hsl.h + (Math.random() - 0.5) * amount,
    THREE.MathUtils.clamp(hsl.s + (Math.random() - 0.5) * amount, 0, 1),
    THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * amount, 0, 1),
  )
  return c
}
