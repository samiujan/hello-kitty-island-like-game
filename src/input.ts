/** Keyboard input: WASD / arrows for movement, Space to jump, E to interact. */
export class Input {
  private down = new Set<string>()
  private pressedThisFrame = new Set<string>()

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.down.add(e.code)
      this.pressedThisFrame.add(e.code)
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())
  }

  /** Movement axis in screen space: x = right, y = forward (up on screen). */
  moveAxis(): { x: number; y: number } {
    let x = 0
    let y = 0
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  /** True exactly on the frame the key transitions to down. */
  pressed(code: string): boolean {
    return this.pressedThisFrame.has(code)
  }

  endFrame(): void {
    this.pressedThisFrame.clear()
  }
}
