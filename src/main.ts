import './style.css'
import { Game } from './game'

const container = document.getElementById('app')
if (!container) throw new Error('#app container missing')
const game = new Game(container)
// debug/test hook: (window as any).__game
;(window as unknown as Record<string, unknown>).__game = game
