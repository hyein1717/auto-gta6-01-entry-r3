// input.js — keyboard state plus a drag-orbit mouse camera. Everything the
// player and vehicles need is exposed as plain fields so the game loop can
// poll once per frame; one-shot actions (enter car, pause, horn) are queued
// as "pressed" events that the loop consumes exactly once.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedQueue = new Set();
    this.camYaw = Math.PI; // start looking north across the bay strip
    this.camPitch = 0.32;
    this.camDist = 9;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = false; // the start screen flips this on

    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      const code = ev.code;
      this.keys.add(code);
      this.pressedQueue.add(code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (ev) => {
      this.dragging = true;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!this.dragging) return;
      const dx = ev.clientX - this.lastX;
      const dy = ev.clientY - this.lastY;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.camYaw -= dx * 0.0052;
      this.camPitch = clamp(this.camPitch + dy * 0.004, 0.06, 1.15);
    });
    const stopDrag = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('wheel', (ev) => {
      this.camDist = clamp(this.camDist + Math.sign(ev.deltaY) * 1.4, 5, 20);
    }, { passive: true });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press; consumes the queued press.
  pressed(code) {
    if (this.pressedQueue.has(code)) {
      this.pressedQueue.delete(code);
      return true;
    }
    return false;
  }

  // Forward/strafe axes in [-1, 1] from WASD + arrows.
  moveAxes() {
    let f = 0;
    let s = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) f += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) f -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) s -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) s += 1;
    return { forward: f, strafe: s };
  }

  clearPresses() {
    this.pressedQueue.clear();
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
