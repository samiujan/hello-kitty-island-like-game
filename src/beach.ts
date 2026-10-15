import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PAL, matte } from './palette'

/** World-space anchor points for the jet ski ride (the island group is scaled,
 *  but the ski lives in the unscaled scene root). These track the island rim:
 *  the disc's radius is 26 pre-scale → 26 * 1.28 = 33.28 world units. */
export const JETSKI_PARKED = new THREE.Vector3(34.9, -2.43, 0.8)
export const BEACH_SPOT = new THREE.Vector3(29.5, 0, 0)
export const WATER_Y = -2.43
export const RIDE_MIN_R = 34.5
export const RIDE_MAX_R = 68

/** A cute round jet ski. Faces +Z. */
export function buildJetSki(): THREE.Group {
  const j = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.5, 2.1, 4, 0.22), matte('#ff8fb4'))
  body.position.y = 0.32
  body.castShadow = true
  j.add(body)
  // nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), matte('#ff8fb4'))
  nose.position.set(0, 0.34, 1.0)
  nose.scale.set(1, 0.72, 1.3)
  nose.castShadow = true
  j.add(nose)
  // hull
  const hull = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.22, 2.0, 3, 0.1), matte('#6f9fd8'))
  hull.position.y = 0.08
  j.add(hull)
  // seat
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.28, 1.0, 3, 0.12), matte('#4a3b50'))
  seat.position.set(0, 0.66, -0.25)
  seat.castShadow = true
  j.add(seat)
  // handlebars
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 8), matte('#fff6ec'))
  column.position.set(0, 0.72, 0.55)
  column.rotation.x = -0.3
  j.add(column)
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), matte('#fff6ec'))
  bar.position.set(0, 0.94, 0.48)
  bar.rotation.z = Math.PI / 2
  j.add(bar)
  for (const gx of [-0.34, 0.34]) {
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), matte(PAL.flowerYellow))
    grip.position.set(gx, 0.94, 0.48)
    j.add(grip)
  }
  // side accents
  for (const sx of [-0.44, 0.44]) {
    const accent = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), matte(PAL.flowerYellow))
    accent.position.set(sx, 0.45, 0.3)
    j.add(accent)
  }
  return j
}
