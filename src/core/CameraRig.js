/* CameraRig.js — THE camera.
   ===========================================================================
   This is the only thing in the game that writes `camera.position` or
   `camera.rotation`, and the only thing that decides which way "forward" is.
   The hub and the battle both drive this one object. If you are adding a
   camera behaviour, add it here; do not compute a camera anywhere else.

   CONVENTIONS (verified by test_camera.mjs — change these and it fails)

     yaw     0 looks along +Z. forward = (sin yaw, cos yaw) on the XZ plane.
             Mouse RIGHT decreases yaw, which rotates the view to the right.
     pitch   radians ABOVE the focus. 0 is level, positive looks DOWN from
             above. Clamped well short of vertical so the camera can never
             flip, gimbal-lock or roll.
     right   = (-forward.z, forward.x). This is genuinely screen-right for a
             three.js camera looking along `forward` with +Y up, so movement
             and the view can never disagree — they are computed from the same
             yaw, in the same place, on the same frame.

   ORIENTATION is set as explicit Euler angles in YXZ order rather than with
   lookAt(). lookAt() has to pick an up vector, and near-vertical angles make
   that choice unstable — which is where "the camera suddenly flipped" comes
   from. Setting yaw and pitch directly makes roll structurally impossible:
   rotation.z is always exactly 0.

   SMOOTHING is one stage, and only one. Input moves the *target* angles
   instantly, and the rendered angles chase the target with a fast critical
   damp. The camera position is then computed exactly from the smoothed
   angles — it is never independently damped as well. Two smoothing stages in
   series is what makes a camera feel like it is swimming.
*/

import * as THREE from '../../lib/three.module.js';
import { clamp, damp, angleDelta, TAU } from './Util.js';

/* Presets are starting points, not modes. The player can always override any
   of these with the mouse; switching preset re-aims, it does not take control
   away. */
export const CAM_PRESETS = {
  /* Close over-the-shoulder. `shoulder` slides the whole rig sideways so the
     character sits off-centre instead of standing in front of the crosshair —
     at these distances a centred camera means you spend the fight looking at
     the back of your own helmet. */
  hub: {
    dist: 6.0, minDist: 2.4, maxDist: 16,
    pitch: 0.26, minPitch: -0.30, maxPitch: 1.15,
    focusHeight: 1.42, lead: 0, shoulder: 0.78,
    focusRate: 14, angleRate: 26, distRate: 12,
  },
  commander: {
    // The default battle view. You are a person on that field, so the camera
    // sits where a person's camera sits: just behind the shoulder, close
    // enough that armour, weapons and the swing of a sword all read.
    //
    // `shoulder` is tuned against the CROSSHAIR, not against how the pose
    // looks: at 4.8m a character that is even slightly centred stands in
    // front of the reticle, and then every deployment and every attack is
    // aimed at the back of your own helmet.
    dist: 4.8, minDist: 2.2, maxDist: 15,
    pitch: 0.17, minPitch: -0.30, maxPitch: 1.18,
    focusHeight: 1.58, lead: 0, shoulder: 1.25,
    focusRate: 16, angleRate: 26, distRate: 12,
  },
  tactical: {
    // The overview, on Tab. It has to show the LINE — yours and theirs — so
    // it looks down more steeply than a follow camera and leads less far
    // forward than it used to. At a shallower angle the top half of the frame
    // was sky beyond the end of the field, which is a lot of screen spent on
    // nothing.
    dist: 31, minDist: 14, maxDist: 54,
    pitch: 0.92, minPitch: 0.34, maxPitch: 1.28,
    focusHeight: 1.0, lead: 0.46, shoulder: 0,
    focusRate: 9, angleRate: 24, distRate: 10,
  },
};

/** Never let the camera approach vertical: that is where lookAt-style rigs
 *  lose their up vector and snap. 1.36 rad is 78 degrees. */
const HARD_MIN_PITCH = -0.55;
const HARD_MAX_PITCH = 1.36;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    // Euler order matters: YXZ means yaw is applied first and pitch second
    // about the already-yawed axis, which is the standard no-roll setup.
    this.camera.rotation.order = 'YXZ';

    /* target angles — what input writes to */
    this.yaw = 0;
    this.pitch = 0.3;
    this.dist = 9;

    /* smoothed angles — what the camera is actually drawn with */
    this.curYaw = 0;
    this.curPitch = 0.3;
    this.curDist = 9;

    /* focus */
    this.focus = new THREE.Vector3();
    this.curFocus = new THREE.Vector3();

    this.preset = CAM_PRESETS.hub;
    this.presetName = 'hub';

    /* player-facing settings, set from the save */
    this.sensitivity = 1;
    this.invertY = false;

    /* a transient positional offset for impacts. Never touches the angles, so
       it cannot fight the player's input. */
    this.shakeAmount = 0;
    this.shakeSeed = Math.random() * 100;
    this.shakeEnabled = true;

    this.bounds = null;      // optional walkable box, keeps the boom indoors
    this.probe = null;       // (x,z) -> ground height, keeps it above terrain
    this.blockers = null;    // [{x,z,r}] solid props to pull the boom in front of
    this.minClearance = 1.1;
    this.t = 0;
    this._tmp = new THREE.Vector3();
  }

  /* ====================================================================== */
  /* SETUP                                                                   */
  /* ====================================================================== */

  /**
   * Switch preset. `instant` snaps; otherwise the rig eases to the new
   * distance and pitch while KEEPING the player's current yaw, so switching
   * view never spins the world round.
   */
  applyPreset(name, instant = false) {
    const p = CAM_PRESETS[name] || CAM_PRESETS.hub;
    this.preset = p;
    this.presetName = name;
    this.dist = clamp(p.dist, p.minDist, p.maxDist);
    this.pitch = clamp(p.pitch, this._minPitch(), this._maxPitch());
    if (instant) {
      this.curDist = this.dist;
      this.curPitch = this.pitch;
    }
  }

  /** Place the rig outright — used on spawn and on zone entry. */
  reset({ x = 0, y = 0, z = 0, yaw = 0, preset = null } = {}) {
    if (preset) this.applyPreset(preset, true);
    this.yaw = this.curYaw = yaw;
    this.pitch = this.curPitch = clamp(this.preset.pitch, this._minPitch(), this._maxPitch());
    this.dist = this.curDist = this.preset.dist;
    this.focus.set(x, y, z);
    this.curFocus.copy(this.focus);
    this.shakeAmount = 0;
    this._writeTransform(0);
  }

  setFocus(x, y, z) { this.focus.set(x, y, z); }
  setBounds(b) { this.bounds = b || null; }

  /** Ground height lookup, so the boom never dives under the terrain. */
  setProbe(fn) { this.probe = typeof fn === 'function' ? fn : null; }

  /**
   * Solid things the camera must not end up inside, as discs on the XZ plane.
   * Standing next to your own banner used to put the camera inside the
   * monument, which is a black screen at the worst possible moment.
   */
  setBlockers(list) { this.blockers = (list && list.length) ? list : null; }

  _minPitch() { return Math.max(HARD_MIN_PITCH, this.preset.minPitch); }
  _maxPitch() { return Math.min(HARD_MAX_PITCH, this.preset.maxPitch); }

  /* ====================================================================== */
  /* INPUT                                                                   */
  /* ====================================================================== */

  /**
   * Feed a look delta, in device pixels. This is the ONLY way the camera's
   * orientation changes.
   *
   * Mouse right (dx > 0) turns the view right; mouse up (dy < 0) looks up.
   * Both are the non-inverted defaults every modern 3D game ships with.
   */
  look(dx, dy) {
    if (!dx && !dy) return;
    if (!isFinite(dx) || !isFinite(dy)) return;
    // Defence in depth: Input clamps too, but a spike from a trackpad driver,
    // an alt-tab or a synthetic event must never be able to whip the view
    // round even if it reaches the rig by some other route.
    dx = clamp(dx, -260, 260);
    dy = clamp(dy, -260, 260);
    const s = 0.0022 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch += (this.invertY ? -dy : dy) * s;
    this.pitch = clamp(this.pitch, this._minPitch(), this._maxPitch());
    // keep yaw in a sane range so it never accumulates to a float that has
    // lost its precision after a long session
    if (this.yaw > Math.PI) { this.yaw -= TAU; this.curYaw -= TAU; }
    else if (this.yaw < -Math.PI) { this.yaw += TAU; this.curYaw += TAU; }
  }

  /** Wheel notches: positive zooms out. */
  zoom(notches) {
    if (!notches) return;
    const p = this.preset;
    const step = Math.max(0.8, this.dist * 0.16);
    this.dist = clamp(this.dist + notches * step, p.minDist, p.maxDist);
  }

  /** A short positional nudge for impacts. Ignored when the setting is off. */
  addShake(amount) {
    if (!this.shakeEnabled || !(amount > 0)) return;
    this.shakeAmount = Math.min(0.85, this.shakeAmount + amount);
  }

  /**
   * Cancel any in-flight rotation. Called the moment a menu opens, so the
   * camera cannot keep easing toward an angle the player can no longer see or
   * influence — it stops exactly where it is and stays there.
   */
  settleTargets() {
    this.yaw = this.curYaw;
    this.pitch = this.curPitch;
    this.dist = this.curDist;
  }

  /* ====================================================================== */
  /* BASIS — movement and the view are computed from the SAME yaw            */
  /* ====================================================================== */

  /** World-space forward on the XZ plane (the direction the camera faces). */
  get forward() {
    return { x: Math.sin(this.curYaw), z: Math.cos(this.curYaw) };
  }

  /** World-space screen-right on the XZ plane. */
  get right() {
    // right = (-forward.z, forward.x): this is what three.js itself produces
    // for a camera looking along `forward` with +Y up.
    return { x: -Math.cos(this.curYaw), z: Math.sin(this.curYaw) };
  }

  /**
   * Turn a WASD input vector into world movement.
   * @param ix  -1 = A, +1 = D
   * @param iy  -1 = S, +1 = W
   */
  moveVector(ix, iy) {
    if (!ix && !iy) return { x: 0, z: 0 };
    const f = this.forward, r = this.right;
    let x = f.x * iy + r.x * ix;
    let z = f.z * iy + r.z * ix;
    const l = Math.hypot(x, z);
    if (l > 1e-6) { x /= l; z /= l; }
    return { x, z };
  }

  /** The yaw a character should face to be looking the way the camera is. */
  get facingYaw() {
    // character facing is stored as atan2(dz, dx); the camera's forward in
    // that convention is atan2(cos yaw, sin yaw)
    const f = this.forward;
    return Math.atan2(f.z, f.x);
  }

  /* ====================================================================== */
  /* UPDATE                                                                  */
  /* ====================================================================== */

  update(dt) {
    this.t += dt;
    const p = this.preset;

    /* --- smooth the angles. One stage, fast enough to feel direct. ------
       Exponential approach never actually ARRIVES, so without the snap below
       the camera would creep by a millionth of a radian forever and "the
       camera must not drift" would be quietly false. */
    const dYaw = angleDelta(this.curYaw, this.yaw);
    this.curYaw = Math.abs(dYaw) < SNAP
      ? this.yaw
      : this.curYaw + dYaw * (1 - Math.exp(-p.angleRate * dt));
    this.curPitch = Math.abs(this.pitch - this.curPitch) < SNAP
      ? this.pitch : damp(this.curPitch, this.pitch, p.angleRate, dt);
    this.curDist = Math.abs(this.dist - this.curDist) < SNAP
      ? this.dist : damp(this.curDist, this.dist, p.distRate, dt);

    /* --- follow the focus --------------------------------------------- */
    for (const k of ['x', 'y', 'z']) {
      this.curFocus[k] = Math.abs(this.focus[k] - this.curFocus[k]) < SNAP
        ? this.focus[k] : damp(this.curFocus[k], this.focus[k], p.focusRate, dt);
    }

    /* --- shake decays on its own and only offsets position ------------- */
    if (this.shakeAmount > 0) this.shakeAmount = Math.max(0, this.shakeAmount - dt * 6.5);

    this._writeTransform(dt);
  }

  _writeTransform(dt) {
    const p = this.preset;
    const cam = this.camera;

    const sinP = Math.sin(this.curPitch), cosP = Math.cos(this.curPitch);
    const f = { x: Math.sin(this.curYaw), z: Math.cos(this.curYaw) };

    // the point the camera is aimed at: the focus, raised to eye height, and
    // pushed forward a little in the overhead preset so you see the ground
    // ahead of you rather than the top of your own head
    const lead = p.lead * this.curDist;

    /* Shoulder offset. The aim point AND the camera slide the same distance
       along screen-right, so the view stays parallel and the character simply
       sits off to one side. Offsetting only the camera would swing the aim
       across the character and make the crosshair lie about where a shot or a
       deployment is going to land. */
    const sh = p.shoulder || 0;
    const rx = -Math.cos(this.curYaw), rz = Math.sin(this.curYaw);

    const ax = this.curFocus.x + f.x * lead + rx * sh;
    const ay = this.curFocus.y + p.focusHeight;
    const az = this.curFocus.z + f.z * lead + rz * sh;

    let horiz = this.curDist * cosP;
    let vert = this.curDist * sinP;

    /* Keep the boom out of solid things. Shortening it is the standard fix and
       is far less jarring than clipping through geometry — and a camera inside
       a wall, a monument or the ground is just a black screen. */
    const b = this.bounds, blockers = this.blockers;
    if (b || blockers) {
      for (let i = 0; i < 8; i++) {
        const px = ax - f.x * horiz, pz = az - f.z * horiz;
        let bad = false;
        if (b && (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1)) bad = true;
        if (!bad && blockers) {
          for (const o of blockers) {
            const dx = px - o.x, dz = pz - o.z;
            if (dx * dx + dz * dz < o.r * o.r) { bad = true; break; }
          }
        }
        if (!bad) break;
        horiz *= 0.78; vert *= 0.78;
        if (horiz < 1.0) break;
      }
    }

    let px = ax - f.x * horiz;
    let py = ay + vert;
    let pz = az - f.z * horiz;

    // and never below the ground
    if (this.probe) {
      const g = this.probe(px, pz);
      if (isFinite(g) && py < g + this.minClearance) py = g + this.minClearance;
    }

    if (this.shakeAmount > 0) {
      const s = this.shakeAmount * this.shakeAmount;
      const t = this.t * 38 + this.shakeSeed;
      px += Math.sin(t) * s * 0.5;
      py += Math.cos(t * 1.43) * s * 0.4;
      pz += Math.sin(t * 0.87) * s * 0.5;
    }

    cam.position.set(px, py, pz);

    // Explicit orientation. rotation.z is never written, so there is no roll,
    // and pitch is clamped short of vertical, so there is no flip.
    cam.rotation.y = this.curYaw + Math.PI;
    cam.rotation.x = -this.curPitch;
    cam.rotation.z = 0;
    cam.updateMatrixWorld(true);
  }

  /** A ray through the centre of the screen — the crosshair, under pointer lock. */
  centreRay(raycaster) {
    raycaster.setFromCamera(CENTRE, this.camera);
    return raycaster;
  }
}

const CENTRE = { x: 0, y: 0 };

/** Below this, a smoothed value is snapped to its target rather than creeping. */
const SNAP = 1e-5;
