import * as THREE from 'three'
import { buildAnimal, animateAnimal, type AnimalRig, type Species } from './cat'
import { WORLD_SCALE } from './world'

export interface NPC {
  name: string
  species: Species
  rig: AnimalRig
  position: THREE.Vector3
  facing: number
  lines: string[]
  phase: number
  hopUntil: number
  nextHopAt: number
  groundH: number
}

interface NPCDef {
  name: string
  species: Species
  x: number
  z: number
  facing: number
  lines: string[]
}

const DEFS: NPCDef[] = [
  {
    name: 'Momo',
    species: 'bunny',
    x: 1.8,
    z: -0.4,
    facing: 0.4,
    lines: [
      'Welcome to Kitten Village! Isn\'t it the softest place ever?',
      'I hid carrots all around the island. Ten points if you find one!',
      'Once you learn to jump, try hopping over the plaza stones!',
    ],
  },
  {
    name: 'Kuma',
    species: 'bear',
    x: -6.3,
    z: -4.4,
    facing: 2.4,
    lines: [
      'This is my little cottage. The pink roof was my idea!',
      'Honey tea at sunset? You\'re invited, of course.',
      'Sometimes I nap under the blossom tree. It\'s the best spot.',
    ],
  },
  {
    name: 'Pip',
    species: 'penguin',
    x: 2.4,
    z: 4.4,
    facing: Math.PI,
    lines: [
      'I waddled ALL the way here. Worth it!',
      'Do you think clouds taste like marshmallows? I do.',
      'Waddle waddle waddle... oh! Didn\'t see you there!',
    ],
  },
  {
    name: 'Biscuit',
    species: 'puppy',
    x: 5.6,
    z: -0.4,
    facing: -1.2,
    lines: [
      'You smell like sunshine! In a good way!',
      'Race you to the picnic blanket! Ready, set... wait for me!',
      'If you find a stick on your travels, I MUST know about it.',
    ],
  },
]

export function buildNPCs(): NPC[] {
  return DEFS.map((d, i) => {
    const rig = buildAnimal(d.species)
    const x = d.x * WORLD_SCALE
    const z = d.z * WORLD_SCALE
    rig.group.position.set(x, 0, z)
    rig.group.rotation.y = d.facing
    return {
      name: d.name,
      species: d.species,
      rig,
      position: new THREE.Vector3(x, 0, z),
      facing: d.facing,
      lines: d.lines,
      phase: i * 1.7,
      hopUntil: 0,
      nextHopAt: 2 + i,
      groundH: 0,
    }
  })
}

export function animateNPCs(npcs: NPC[], t: number, playerPos: THREE.Vector3): void {
  for (const npc of npcs) {
    const rig = npc.rig
    const dist = rig.group.position.distanceTo(playerPos)

    // face the player when nearby, otherwise return to default facing
    let targetFacing = npc.facing
    if (dist < 3.4) {
      const dx = playerPos.x - npc.position.x
      const dz = playerPos.z - npc.position.z
      targetFacing = Math.atan2(dx, dz)
    }
    let delta = targetFacing - rig.group.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    rig.group.rotation.y += delta * Math.min(1, 0.08)

    // idle hop for bunnies
    if (npc.species === 'bunny') {
      if (t > npc.nextHopAt) {
        npc.hopUntil = t + 0.45
        npc.nextHopAt = t + 3 + Math.random() * 4
      }
    }
    let hopY = 0
    if (t < npc.hopUntil) {
      const p = 1 - (npc.hopUntil - t) / 0.45
      hopY = Math.sin(p * Math.PI) * 0.28
    }

    rig.group.position.y = npc.groundH + hopY
    animateAnimal(rig, t + npc.phase, 0, 0)

    // blob shadow shrinks mid-hop
    rig.blob.scale.setScalar(1 - hopY * 0.5)
  }
}
