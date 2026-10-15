import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { matte } from './palette'
import { WORLD_SCALE } from './world'
import type { NPC } from './npcs'

/**
 * "The Warmest Thing" — the village story.
 *
 * An egg in the museum has gone cold. Each of the four friends gives the kitten
 * one warm thing, but only after a small errand. Once all four are gathered the
 * egg hatches into Sprout, who follows the kitten from then on.
 */

export type WarmId = 'honey' | 'pebble' | 'blanket' | 'scarf'

/** Where a warm thing sits: not asked yet → asked → item in paw → handed over. */
type Stage = 'idle' | 'searching' | 'carrying' | 'done'

export interface ItemSpot {
  id: WarmId
  label: string
  x: number
  z: number
}

interface WarmDef {
  id: WarmId
  giver: string
  /** Village co-ordinates of the pick-up item; omitted for the monkey-bars errand. */
  spot?: { x: number; z: number }
  spotLabel: string
  ask: string[]
  remind: string[]
  carry: string[]
  /** Banner shown the moment the item is picked up. */
  found: string
  name: string
}

const S = WORLD_SCALE
/** Matches Dialogue's line lifetime so a "conversation" spans rapid re-presses. */
const CONVO_MS = 4200
const BANNER_MS = 4600

const WARM: WarmDef[] = [
  {
    id: 'honey',
    giver: 'Kuma',
    name: 'jar of honey',
    spot: { x: 8.4 * S, z: -13.2 * S },
    spotLabel: 'grab the honey jar',
    ask: [
      "Oh! You've heard about the egg? Then of course I'll help.",
      "The warmest thing I know is honey tea — but I've run right out of honey!",
      'The farm by the museum keeps jars in the barn. Would you fetch one?',
    ],
    remind: ['The honey is at the farm — look by the big red barn!'],
    carry: [
      'You found it! Wonderful.',
      'Here — a jar of honey tea, still warm. Take it to the egg.',
    ],
    found: 'You found a jar of honey! 🍯 Take it back to Kuma.',
  },
  {
    id: 'pebble',
    giver: 'Pip',
    name: 'warm pebble',
    spot: { x: 19.4 * S, z: 3.4 * S },
    spotLabel: 'grab the warm pebble',
    ask: [
      'You are helping the egg hatch? Pip is ON the case!',
      'Penguins know all about being cold. So I keep a sun-warmed pebble.',
      'I left it on the beach, by the stripy umbrella. Waddle over and grab it?',
    ],
    remind: ["It's on the beach! Look near the stripy umbrella."],
    carry: ['My pebble! Still warm.', 'Take it — the egg needs it more than I do.'],
    found: 'You found the sun-warmed pebble! ☀️ Take it back to Pip.',
  },
  {
    id: 'blanket',
    giver: 'Biscuit',
    name: 'fuzzy blanket',
    spot: { x: 5.9 * S, z: -5.4 * S },
    spotLabel: 'grab the fuzzy blanket',
    ask: [
      'A cold egg?! Biscuit can fix that!',
      'I had the fuzziest blanket. But the wind took it while I was picnicking!',
      'I saw it land by the pink blossom tree near the plaza. Can you get it?',
    ],
    remind: ['It blew toward the blossom tree, by the plaza!'],
    carry: ["My blanket! You're the best.", 'Here — it belongs to the egg now.'],
    found: 'You found the fuzzy blanket! 🧣 Take it back to Biscuit.',
  },
  {
    id: 'scarf',
    giver: 'Momo',
    name: 'hop-scarf',
    spotLabel: 'cross the monkey bars',
    ask: [
      'The egg! Yes! I was hoping somebody would ask me.',
      'I knitted a hop-scarf. Super warm. Super bouncy.',
      'But first — race me! Cross the monkey bars at the playground and it is yours!',
    ],
    remind: ['Go on, cross the monkey bars! They are at the playground, past the slide.'],
    carry: [
      "Whoa, you're quick! A deal is a deal.",
      'Here is the hop-scarf. Bounciest warm thing there is.',
    ],
    found: 'You crossed the monkey bars! 🐒 Go and tell Momo.',
  },
]

const INTRO = {
  title: 'The Warmest Thing',
  body: [
    'Something is wobbling in the museum.',
    'The little egg on the pedestal has been asleep for a hundred years — and it has gone cold. To wake it up, it needs the four warmest things on the island.',
    'Momo, Kuma, Pip and Biscuit each have one to give. Will you help?',
    '<span class="story-tip">Tip: walk up to a friend and press <b>E</b> to talk.</span>',
  ],
  button: "Let's go!",
}

const HATCH: { title: string; body: string; button: string }[] = [
  {
    title: 'The Warmest Thing',
    body: 'You tuck the honey tea, the warm pebble, the fuzzy blanket and the hop-scarf around the little egg.',
    button: 'Next',
  },
  {
    title: 'Wobble... wobble...',
    body: 'The egg rocks. It glows. Then — <b>CRACK!</b>',
    button: 'Next',
  },
  {
    title: 'Peep!',
    body: 'A tiny dinosaur pokes its head out. It blinks up at you, then hops into your paws.',
    button: 'Next',
  },
  {
    title: 'Meet Sprout 💚',
    body: 'Sprout will follow you everywhere now. Take good care of your new friend!',
    button: 'Hello, Sprout!',
  },
]

/** The story's quest state plus all of its on-screen furniture. */
export class Story {
  private phase: 'intro' | 'active' | 'done' = 'intro'
  private progress: Record<WarmId, Stage> = {
    honey: 'idle',
    pebble: 'idle',
    blanket: 'idle',
    scarf: 'idle',
  }

  // one conversation at a time, so a beat's lines stay stable while re-pressing
  private convoNpc: string | null = null
  private convoUntil = 0
  private convoLines: string[] = []
  private convoShown = 0

  private items = new Map<WarmId, THREE.Group>()
  private trackerEl: HTMLDivElement
  private trackerSlots: HTMLDivElement
  private bannerEl: HTMLDivElement
  private bannerUntil = 0
  private cardEl: HTMLDivElement
  private cardPage = 0

  /** Fired the moment the egg hatches, so the game can bring Sprout in. */
  onHatch: (() => void) | null = null

  constructor(
    hud: HTMLElement,
    scene: THREE.Scene,
    private groundAt: (x: number, z: number) => number,
  ) {
    this.buildItems(scene)

    this.trackerEl = document.createElement('div')
    this.trackerEl.className = 'tracker'
    this.trackerEl.style.display = 'none'
    const title = document.createElement('div')
    title.className = 'tracker-title'
    title.textContent = 'Warm things'
    this.trackerSlots = document.createElement('div')
    this.trackerSlots.className = 'tracker-slots'
    this.trackerEl.append(title, this.trackerSlots)
    hud.appendChild(this.trackerEl)

    this.bannerEl = document.createElement('div')
    this.bannerEl.className = 'story-banner'
    this.bannerEl.style.display = 'none'
    hud.appendChild(this.bannerEl)

    this.cardEl = document.createElement('div')
    this.cardEl.className = 'story-card'
    this.cardEl.style.display = 'none'
    hud.appendChild(this.cardEl)

    this.renderTracker()
    this.showIntro()
  }

  // ---------------------------------------------------------------- world props

  private buildItems(scene: THREE.Scene): void {
    for (const def of WARM) {
      if (!def.spot) continue
      const g = buildWarmMesh(def.id)
      const y = this.groundAt(def.spot.x, def.spot.z)
      g.position.set(def.spot.x, y, def.spot.z)
      g.userData.baseY = y
      g.visible = false
      scene.add(g)
      this.items.set(def.id, g)
    }
  }

  /** Village spots the game should turn into pick-up interactables. */
  itemSpots(): ItemSpot[] {
    const out: ItemSpot[] = []
    for (const def of WARM) {
      if (def.spot) out.push({ id: def.id, label: def.spotLabel, x: def.spot.x, z: def.spot.z })
    }
    return out
  }

  // ---------------------------------------------------------------- dialogue

  /**
   * The lines this friend should say right now. When the player has been shown
   * the whole beat the story advances, so an errand is handed out on the last
   * line and a reward on the last line back.
   */
  linesFor(npc: NPC): string[] {
    const now = performance.now()
    if (this.convoNpc !== npc.name || now >= this.convoUntil) {
      this.convoLines = this.beatFor(npc)
      this.convoNpc = npc.name
      this.convoShown = 0
    }
    this.convoUntil = now + CONVO_MS
    this.convoShown++
    if (this.convoShown === this.convoLines.length) this.finishBeat(npc.name)
    return this.convoLines
  }

  private beatFor(npc: NPC): string[] {
    const def = WARM.find((w) => w.giver === npc.name)
    if (!def || this.phase !== 'active') return npc.lines
    switch (this.progress[def.id]) {
      case 'idle':
        return def.ask
      case 'searching':
        return def.remind
      case 'carrying':
        return def.carry
      default:
        return npc.lines
    }
  }

  private finishBeat(name: string): void {
    const def = WARM.find((w) => w.giver === name)
    if (!def || this.phase !== 'active') return
    if (this.progress[def.id] === 'idle') {
      this.progress[def.id] = 'searching'
      this.renderTracker()
    } else if (this.progress[def.id] === 'carrying') {
      this.progress[def.id] = 'done'
      this.renderTracker()
      const left = 4 - this.collected()
      if (left > 0) {
        this.banner(`You got the ${def.name}! ${left} to go 🧡`)
      } else {
        this.banner('All four warm things! Take them to the egg in the museum 🥚', 6500)
      }
    }
  }

  // ---------------------------------------------------------------- quest state

  /** True while an item is out in the world waiting to be found. */
  isSearching(id: WarmId): boolean {
    return this.phase === 'active' && this.progress[id] === 'searching'
  }

  pickup(id: WarmId): void {
    if (!this.isSearching(id)) return
    const def = WARM.find((w) => w.id === id)
    if (!def) return
    this.progress[id] = 'carrying'
    this.renderTracker()
    this.banner(def.found)
  }

  /** Momo's errand completes on the monkey bars rather than on a pick-up. */
  barsCrossed(): void {
    if (!this.isSearching('scarf')) return
    this.progress.scarf = 'carrying'
    this.banner(WARM.find((w) => w.id === 'scarf')!.found)
  }

  collected(): number {
    return WARM.reduce((n, w) => n + (this.progress[w.id] === 'done' ? 1 : 0), 0)
  }

  hatched(): boolean {
    return this.phase === 'done'
  }

  /** Amplitude for the egg's wobble — 0 once it has hatched. */
  eggWobble(): number {
    return this.phase === 'done' ? 0 : 0.13
  }

  // ---------------------------------------------------------------- egg

  interactEgg(): void {
    if (this.phase === 'done') {
      this.banner('Sprout says hello! 💚')
      return
    }
    const left = 4 - this.collected()
    if (left > 0) {
      this.banner(`The egg is still cold. It needs ${left} more warm thing${left === 1 ? '' : 's'}.`)
      return
    }
    this.cardPage = 0
    this.showHatchPage()
  }

  private showHatchPage(): void {
    const page = HATCH[this.cardPage]
    const last = this.cardPage === HATCH.length - 1
    this.showCard(`<h1>${page.title}</h1><p>${page.body}</p>`, page.button, () => {
      if (!last) {
        this.cardPage++
        this.showHatchPage()
        return
      }
      this.hideCard()
      this.phase = 'done'
      this.trackerEl.style.display = 'none'
      this.onHatch?.()
      this.banner('Sprout will follow you everywhere 💚', 6000)
    })
  }

  // ---------------------------------------------------------------- per-frame

  update(t: number): void {
    if (this.bannerEl.style.display === 'block' && performance.now() > this.bannerUntil) {
      this.bannerEl.style.display = 'none'
    }
    // float the findable items so they are easy to spot
    for (const [id, g] of this.items) {
      const show = this.isSearching(id)
      g.visible = show
      if (!show) continue
      const baseY = (g.userData.baseY as number) ?? 0
      g.position.y = baseY + 0.2 + Math.sin(t * 2.6 + id.length) * 0.07
      g.rotation.y = t * 1.1
    }
  }

  // ---------------------------------------------------------------- UI

  banner(html: string, ms = BANNER_MS): void {
    this.bannerEl.innerHTML = html
    this.bannerEl.style.display = 'block'
    this.bannerEl.style.animation = 'none'
    void this.bannerEl.offsetWidth
    this.bannerEl.style.animation = ''
    this.bannerUntil = performance.now() + ms
  }

  private renderTracker(): void {
    const done = this.collected()
    this.trackerSlots.innerHTML =
      WARM.map((w) => {
        const filled = this.progress[w.id] === 'done'
        return `<span class="slot${filled ? ' filled' : ''}">${filled ? '🧡' : '🤍'}</span>`
      }).join('') + `<span class="count">${done}/4</span>`
  }

  private showIntro(): void {
    const body = INTRO.body.map((p) => `<p>${p}</p>`).join('')
    this.showCard(`<h1>${INTRO.title}</h1>${body}`, INTRO.button, () => {
      this.hideCard()
      this.phase = 'active'
      this.trackerEl.style.display = 'block'
      this.banner('Find the four warm things! 🧡', 5000)
    })
  }

  private showCard(inner: string, buttonLabel: string, onClick: () => void): void {
    this.cardEl.innerHTML = `<div class="story-panel">${inner}<button class="story-btn">${buttonLabel}</button></div>`
    this.cardEl.style.display = 'flex'
    const btn = this.cardEl.querySelector('button')
    if (btn) btn.onclick = onClick
  }

  private hideCard(): void {
    this.cardEl.style.display = 'none'
  }
}

// ---------------------------------------------------------------- prop meshes

/** A small, obviously-a-collectible prop for each findable warm thing. */
function buildWarmMesh(id: WarmId): THREE.Group {
  const g = new THREE.Group()

  if (id === 'honey') {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.3, 14), matte('#e8a33c'))
    jar.position.y = 0.15
    jar.castShadow = true
    g.add(jar)
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.11, 14), matte('#ffd9e6'))
    label.position.y = 0.15
    g.add(label)
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14), matte('#fff6ec'))
    lid.position.y = 0.33
    g.add(lid)
  } else if (id === 'pebble') {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), matte('#ffb877'))
    rock.position.y = 0.14
    rock.scale.set(1.25, 0.8, 1)
    rock.castShadow = true
    g.add(rock)
    const small = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), matte('#ffcf9e'))
    small.position.set(0.17, 0.08, 0.07)
    g.add(small)
  } else if (id === 'blanket') {
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.14, 0.4, 3, 0.05), matte('#b8d8f0'))
    blanket.position.y = 0.08
    blanket.castShadow = true
    g.add(blanket)
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.47, 0.05, 0.1, 2, 0.02), matte('#fff6ec'))
    stripe.position.y = 0.14
    g.add(stripe)
  }

  // soft ring so the item reads as "pick me up"
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.37, 26),
    new THREE.MeshBasicMaterial({
      color: '#fff3c8',
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -0.18
  g.add(ring)

  return g
}
