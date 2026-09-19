/* Input.js — keyboard, mouse and pointer state.

   Two distinct mouse concepts, deliberately kept apart, because conflating
   them is what made the old camera fight the player:

     CURSOR  (mouse.x / nx / ny) — a position on screen. Used for clicking UI
             and for picking the ground when the pointer is NOT locked.
     LOOK    (lookDx / lookDy)   — a relative movement this frame. Used for,
             and only for, turning the camera.

   `lookDx/lookDy` are non-zero only while the camera is genuinely under mouse
   control: pointer locked, or the right button held as the fallback. They are
   forced to zero whenever a menu is open. That single rule is what guarantees
   the camera cannot rotate while the player is using the interface.
*/

class InputSystem {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();

    /** Set while a UI screen or dialogue owns the input. Blocks movement keys
     *  AND look deltas — nothing else needs to know about menus. */
    this.blocked = false;

    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, wheel: 0 };
    this.lookDx = 0;
    this.lookDy = 0;
    this.buttons = [false, false, false];
    this.clicked = [false, false, false];
    this.released = [false, false, false];
    this.overUI = false;

    this.pointerLocked = false;
    this.lockWanted = false;       // the player has engaged camera control
    this.lockSupported = true;

    this._bound = false;
    this._onLockChange = null;
  }

  attach(canvas) {
    if (this._bound) return;
    this._bound = true;
    this.canvas = canvas;
    this.lockSupported = !!canvas.requestPointerLock;

    addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.code;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      if (PREVENT.has(k)) e.preventDefault();
    });

    addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.justReleased.add(e.code);
    });

    // Losing focus must clear held state, or the player comes back to a
    // character walking into a wall.
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = [false, false, false];
      this.lookDx = this.lookDy = 0;
    });

    /* ------------------------------------------------------------ move */
    addEventListener('mousemove', e => {
      // Under pointer lock the cursor does not move, so movementX/Y is the
      // only signal. Unlocked, we derive the delta from the cursor position
      // rather than trusting movementX — some trackpad drivers report wildly
      // scaled values there.
      if (this.pointerLocked) {
        this.lookDx += e.movementX || 0;
        this.lookDy += e.movementY || 0;
        return;
      }
      const px = this.mouse.x, py = this.mouse.y;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ny = -(e.clientY / innerHeight) * 2 + 1;
      this.overUI = this._hitUI(e.target);
      // fallback look: only while the right button is held on the world
      if (this.buttons[2] && !this.overUI) {
        this.lookDx += e.clientX - px;
        this.lookDy += e.clientY - py;
      }
    }, { passive: true });

    /* ----------------------------------------------------------- click */
    addEventListener('mousedown', e => {
      this.overUI = this._hitUI(e.target);
      if (e.button < 3) {
        this.buttons[e.button] = true;
        if (!this.overUI) this.clicked[e.button] = true;
      }
    });
    addEventListener('mouseup', e => {
      if (e.button < 3) { this.buttons[e.button] = false; this.released[e.button] = true; }
    });

    addEventListener('contextmenu', e => { if (!this._hitUI(e.target)) e.preventDefault(); });

    addEventListener('wheel', e => {
      if (this._hitUI(e.target)) return;
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    /* ------------------------------------------------------ touch look */
    // one finger drags the camera; taps still reach the UI
    let touchId = null, tx = 0, ty = 0;
    addEventListener('touchstart', e => {
      if (this._hitUI(e.target)) return;
      const t = e.changedTouches[0];
      touchId = t.identifier; tx = t.clientX; ty = t.clientY;
    }, { passive: true });
    addEventListener('touchmove', e => {
      if (touchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        this.lookDx += (t.clientX - tx) * 1.4;
        this.lookDy += (t.clientY - ty) * 1.4;
        tx = t.clientX; ty = t.clientY;
      }
    }, { passive: true });
    addEventListener('touchend', () => { touchId = null; }, { passive: true });

    /* ---------------------------------------------------- pointer lock */
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.pointerLocked = locked;
      if (!locked) {
        this.lockWanted = false;
        this.lookDx = this.lookDy = 0;
      }
      this._onLockChange?.(locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockSupported = false;
      this.lockWanted = false;
    });
  }

  /* ------------------------------------------------------- pointer lock */

  requestLock() {
    if (!this.lockSupported || this.pointerLocked || !this.canvas) return;
    this.lockWanted = true;
    try { this.canvas.requestPointerLock(); } catch (e) { this.lockSupported = false; }
  }

  releaseLock() {
    this.lockWanted = false;
    if (this.pointerLocked && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) { /* already gone */ }
    }
    this.lookDx = this.lookDy = 0;
  }

  onLockChange(fn) { this._onLockChange = fn; }

  /** True when the mouse is currently steering the camera. */
  get lookActive() {
    return !this.blocked && (this.pointerLocked || this.buttons[2]);
  }

  /* ------------------------------------------------------------ queries */

  down(...codes) { if (this.blocked) return false; return codes.some(c => this.keys.has(c)); }
  pressed(...codes) { if (this.blocked) return false; return codes.some(c => this.justPressed.has(c)); }
  releasedKey(...codes) { return codes.some(c => this.justReleased.has(c)); }
  rawDown(...codes) { return codes.some(c => this.keys.has(c)); }
  rawPressed(...codes) { return codes.some(c => this.justPressed.has(c)); }

  /** WASD / arrows as a normalised vector. x = right, y = forward. */
  moveAxis() {
    if (this.blocked) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1e-4) { x /= l; y /= l; }
    return { x, y };
  }

  /**
   * The camera look delta for this frame, or zero when the camera should not
   * be moving. Every caller gets the same answer from the same place.
   */
  lookDelta() {
    if (this.blocked || !this.lookActive) return ZERO;
    // A single event should never be able to whip the camera round — a bad
    // driver spike or an alt-tab can report an enormous movementX.
    return {
      x: Math.max(-220, Math.min(220, this.lookDx)),
      y: Math.max(-220, Math.min(220, this.lookDy)),
    };
  }

  _hitUI(el) {
    while (el) {
      if (el === this.canvas) return false;
      if (el.id === 'ui' || el.id === 'topbar' || el.id === 'hud' || el.id === 'toasts') return true;
      if (el.classList && (el.classList.contains('screen') || el.classList.contains('overlay') ||
        el.classList.contains('dock') || el.classList.contains('dialogue'))) return true;
      el = el.parentElement;
    }
    return false;
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.clicked = [false, false, false];
    this.released = [false, false, false];
    this.lookDx = 0; this.lookDy = 0;
    this.mouse.wheel = 0;
  }
}

const ZERO = { x: 0, y: 0 };

const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
]);

export const input = new InputSystem();
