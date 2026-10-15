import * as THREE from 'three'
import type { NPC } from './npcs'

const HINT_RANGE = 2.3
const BUBBLE_RANGE = 3.6
const LINE_DURATION_MS = 4200

/** DOM speech bubbles anchored above NPCs via 3D → screen projection. */
export class Dialogue {
  private bubble: HTMLDivElement
  private hint: HTMLDivElement
  private activeNPC: NPC | null = null
  private activeLineIndex = 0
  private hideAt = 0

  constructor(container: HTMLElement) {
    this.bubble = document.createElement('div')
    this.bubble.className = 'bubble'
    this.bubble.style.display = 'none'
    container.appendChild(this.bubble)

    this.hint = document.createElement('div')
    this.hint.className = 'bubble hint'
    this.hint.innerHTML = '<span class="text">press <b>E</b> to talk</span>'
    this.hint.style.display = 'none'
    container.appendChild(this.hint)
  }

  /** Show (or advance) a line from the nearest NPC. Pass `lines` for story beats. */
  talk(npc: NPC, lines: string[] = npc.lines): void {
    if (this.activeNPC === npc && performance.now() < this.hideAt) {
      this.activeLineIndex++
    } else {
      this.activeNPC = npc
      this.activeLineIndex = 0
    }
    const line = lines[this.activeLineIndex % lines.length]
    this.bubble.innerHTML = `<div class="name" style="color:${nameColor(npc.species)}">${npc.name}</div><div class="text">${line}</div>`
    this.bubble.style.display = 'block'
    // restart the pop animation
    this.bubble.style.animation = 'none'
    void this.bubble.offsetWidth
    this.bubble.style.animation = ''
    this.hideAt = performance.now() + LINE_DURATION_MS
  }

  /** Hide every bubble (used when entering a shop interior). */
  hide(): void {
    this.bubble.style.display = 'none'
    this.hint.style.display = 'none'
    this.activeNPC = null
  }

  update(camera: THREE.Camera, npcs: NPC[], playerPos: THREE.Vector3): void {
    // find nearest npc for the hint bubble
    let nearest: NPC | null = null
    let nearestDist = Infinity
    for (const npc of npcs) {
      const d = npc.rig.group.position.distanceTo(playerPos)
      if (d < nearestDist) {
        nearestDist = d
        nearest = npc
      }
    }

    if (nearest && nearestDist < HINT_RANGE && !(this.activeNPC === nearest && performance.now() < this.hideAt)) {
      this.hint.style.display = 'block'
      this.place(this.hint, nearest, camera, 1.7)
    } else {
      this.hint.style.display = 'none'
    }

    // keep the active bubble above its npc until it expires or we walk away
    if (this.activeNPC) {
      const dist = this.activeNPC.rig.group.position.distanceTo(playerPos)
      if (performance.now() > this.hideAt || dist > BUBBLE_RANGE) {
        this.activeNPC = null
        this.bubble.style.display = 'none'
      } else {
        this.place(this.bubble, this.activeNPC, camera, 1.95)
      }
    }
  }

  private place(el: HTMLElement, npc: NPC, camera: THREE.Camera, heightOffset: number): void {
    const pos = npc.rig.group.position.clone()
    pos.y += heightOffset
    pos.project(camera)
    if (pos.z > 1) {
      el.style.display = 'none'
      return
    }
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }
}

function nameColor(species: string): string {
  switch (species) {
    case 'bunny':
      return '#e878a8'
    case 'bear':
      return '#b07830'
    case 'penguin':
      return '#5a78c8'
    default:
      return '#c8873c'
  }
}
