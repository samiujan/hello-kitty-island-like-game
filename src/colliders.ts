/** Circle colliders on the XZ plane + island boundary.
 *  `h` is the obstacle's top height — a player whose feet are above it
 *  (mid-jump) passes over. Omit `h` for tall obstacles that always block. */
export interface Circle {
  x: number
  z: number
  r: number
  h?: number
}

/**
 * Push a circle of `radius` at (px, pz, py) out of the colliders and back
 * inside the island boundary. Returns the corrected position.
 */
export function resolveCollisions(
  px: number,
  pz: number,
  py: number,
  radius: number,
  colliders: Circle[],
  islandRadius: number,
): { x: number; z: number } {
  let x = px
  let z = pz

  for (const c of colliders) {
    if (c.h !== undefined && py >= c.h - 0.02) continue // clearing the obstacle mid-jump
    const dx = x - c.x
    const dz = z - c.z
    const minDist = c.r + radius
    const distSq = dx * dx + dz * dz
    if (distSq < minDist * minDist && distSq > 1e-8) {
      const dist = Math.sqrt(distSq)
      const push = (minDist - dist) / dist
      x += dx * push
      z += dz * push
    }
  }

  // keep inside the island
  const distFromCenter = Math.hypot(x, z)
  const maxDist = islandRadius - radius
  if (distFromCenter > maxDist) {
    x = (x / distFromCenter) * maxDist
    z = (z / distFromCenter) * maxDist
  }

  return { x, z }
}
