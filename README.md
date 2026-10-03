# Kitten Village 🐱🌸

A cozy, pastel 3D island built entirely from code. You play a tiny kitten wandering a floating diorama island, chatting with animal friends, exploring little shops, riding the playground, and zooming around the lagoon on a jet ski.

No models, no textures, no assets — every tree, cloud, critter, and candy-colored cottage is assembled procedurally from primitive shapes with [Three.js](https://threejs.org/).

## Features

- **A kitten you control** — walk, run, jump, and hop over obstacles with squash-and-stretch animation, tail sway, and a soft blob shadow.
- **Animal friends to meet** — Momo the bunny, Kuma the bear, Pip the penguin, and Biscuit the puppy each have their own lines when you talk to them.
- **Four enterable shops** — the Ice Cream Shop, Barber Shop, Slushie Shop, and a Museum with a dino skeleton. Step inside and the walls fade away so the camera never blocks your view.
- **A playground** — ride the merry-go-round, sit on the swings, slide down the slide, and cross the monkey bars.
- **A jet ski** — hop on at the beach and skim across the pastel lagoon.
- **A living world** — drifting clouds, fluttering butterflies, flickering torch flames, a spinning barber pole, and a fenced farm with a cow, horse, llama, and chicken.
- **A mini farm, picnic spot, blossom trees, and beach** — lots of cozy little corners to poke around.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrow keys | Tap a spot to walk there |
| Jump | `Space` | On-screen ⬆ button |
| Talk | `E` (near a friend) | Tap the friend |
| Enter / exit / interact | `I` | Tap the door or hint bubble |
| Tilt camera | `T` | — |

## Tech stack

- [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Three.js](https://threejs.org/) for rendering (WebGL)
- All art is generated procedurally at runtime

## Project structure

```
index.html          — canvas + HUD mount
package.json        — scripts and dependencies
tsconfig.json       — TypeScript config
vite.config.ts      — dev server (port 5199)
netlify.toml        — Netlify build config
src/main.ts         — bootstrap
src/game.ts         — renderer, scene, lights, and game loop
src/world.ts        — island: terrain, paths, plaza, trees, shops, playground, beach
src/interiors.ts    — shop/museum interiors with camera-aware walls
src/farm.ts         — barn, fence, and farm animals
src/beach.ts        — jet ski
src/cat.ts          — shared procedural animal rigs (kitten, bunny, bear, penguin, puppy)
src/player.ts       — movement, jumping, squash-and-stretch
src/npcs.ts         — animal friends and their dialogue
src/dialogue.ts     — speech bubbles anchored to the 3D world
src/input.ts        — keyboard handling
src/cameraRig.ts    — smooth follow camera
src/colliders.ts    — circle colliders + push-out resolution
src/fading.ts       — fades props that block the camera
src/palette.ts      — pastel palette + shared material factory
src/style.css       — HUD controls card + bubble styling
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) **20.19+** or **22.12+** (Vite 8 requires it; Node 24 LTS works great)
- npm (bundled with Node)

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

The dev server starts at <http://localhost:5199> (the port is fixed in `vite.config.ts`). Vite will hot-reload as you edit files.

### Build for production

```bash
npm run build
```

This type-checks with `tsc` and bundles the game into the `dist/` folder.

### Preview the production build

```bash
npm run preview
```

## Deployment

The project is configured for [Netlify](https://www.netlify.com/) via `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`

Connect the repo to Netlify and it will build and deploy automatically, or deploy any static host by pointing it at the `dist/` folder after running `npm run build`.
