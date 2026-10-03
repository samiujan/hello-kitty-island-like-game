import * as THREE from 'three'

/** A large prop (tree, house) that fades out when it blocks the camera's view. */
export interface Fadeable {
  group: THREE.Group
  center: THREE.Vector3 // world-space center
  radius: number // bounding-sphere-ish radius
  opacity: number
  materials: THREE.MeshStandardMaterial[]
}

/** Clone a group's materials so each fadeable can fade independently. */
export function prepareFadeable(group: THREE.Group, center: THREE.Vector3, radius: number): Fadeable {
  const materials: THREE.MeshStandardMaterial[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone()
      m.material = mat
      materials.push(mat)
    }
  })
  return { group, center, radius, opacity: 1, materials }
}

const GHOST = 0.15 // opacity while blocking the view
const NEAR_FADE = 6.0 // distance (to the object's surface) where full fade kicks in

/**
 * Fade props that sit between the camera and the player, or that the camera
 * is right up against, so the kitten always stays visible.
 */
export function updateFading(
  camera: THREE.Camera,
  playerPos: THREE.Vector3,
  fadeables: Fadeable[],
  dt: number,
): void {
  const camPos = camera.position
  const look = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0))
  const dir = look.clone().sub(camPos)
  const len = dir.length()
  dir.normalize()

  for (const f of fadeables) {
    // is this object inside the camera→player sight corridor?
    const toC = f.center.clone().sub(camPos)
    const t = THREE.MathUtils.clamp(toC.dot(dir), 0, len)
    const closest = camPos.clone().addScaledVector(dir, t)
    const distToLine = f.center.distanceTo(closest)
    // generous corridor: fade as soon as the object is anywhere near the sightline,
    // so canopies clip "sooner" rather than fully blocking first
    const occluding = t > 1.5 && t < len - 0.5 && distToLine < f.radius + 0.3

    // or is the camera basically inside it?
    const surfaceDist = toC.length() - f.radius
    const nearFactor = 1 - THREE.MathUtils.smoothstep(surfaceDist, 1.0, NEAR_FADE)

    const targetO = occluding ? GHOST : 1 - nearFactor * (1 - GHOST)
    f.opacity += (targetO - f.opacity) * (1 - Math.exp(-dt * 9))

    const op = f.opacity
    const transparent = op < 0.995
    for (const m of f.materials) {
      m.opacity = op
      m.transparent = transparent
    }
    // ghosts don't cast shadows
    f.group.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.castShadow = op > 0.4
    })
  }
}
