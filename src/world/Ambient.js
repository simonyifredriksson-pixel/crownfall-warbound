/* Ambient.js — the people who are not for you.

   A headquarters with five named NPCs standing perfectly still in it reads as
   a menu with scenery. This adds the garrison: soldiers walking patrol routes,
   a pair sparring on the drill square, a smith's boy running crates between
   the forge and the store, someone leaning on a spear doing nothing at all.

   None of them can be talked to and none of them matter mechanically. They
   exist so that the courtyard is a place where an army lives.

   Cheap on purpose: they reuse the ordinary unit rig and its procedural walk
   cycle, they never pathfind (routes are authored), and they are removed with
   the zone.
*/

import * as THREE from '../../lib/three.module.js';
import { buildUnitModel } from '../art/UnitArt.js';
import { UNITS } from '../data/Units.js';
import { clamp01, damp, rng, TAU } from '../core/Util.js';

/* Actor kinds:
     patrol  walks a closed route, pausing at each corner
     post    stands at one spot, shifts weight, occasionally looks around
     spar    two actors facing each other, trading swings on a shared timer
     work    walks between two points carrying something, pausing to "work"
*/

class Actor {
  constructor(scene, spec) {
    this.spec = spec;
    const unit = UNITS[spec.unit] || UNITS.militia;
    this.rig = buildUnitModel(unit, spec.level ?? 1, spec.team ?? 0);
    if (this.rig.parts.teamRing) this.rig.parts.teamRing.visible = false;
    if (this.rig.parts.aura) this.rig.parts.aura.visible = false;
    scene.add(this.rig.root);

    this.path = spec.path || [[spec.x ?? 0, spec.z ?? 0]];
    this.i = 0;
    this.x = this.path[0][0];
    this.z = this.path[0][1];
    this.facing = spec.facing ?? rng.range(0, TAU);
    this.speed = spec.speed ?? 2.2;
    this.moving = 0;
    this.wait = rng.range(0, 2.5);
    this.phase = rng.range(0, TAU);
    this.swing = 0;
  }

  update(dt, t) {
    const s = this.spec;
    this.phase += dt;

    if (s.kind === 'spar') {
      // the pair share a beat so the swings actually trade
      const beat = (t * 1.35 + (s.offset || 0)) % 2;
      this.swing = beat < 0.55 ? clamp01(beat / 0.55) : 0;
      this.moving = 0;
      this.facing = s.facing ?? this.facing;
      // a small shuffle in and out of measure
      const lean = Math.sin(t * 1.35 + (s.offset || 0)) * 0.35;
      this.x = s.x + Math.cos(this.facing) * lean;
      this.z = s.z + Math.sin(this.facing) * lean;
    } else if (s.kind === 'post') {
      this.moving = 0;
      this.facing = (s.facing ?? 0) + Math.sin(this.phase * 0.23) * 0.5;
    } else {
      // patrol / work: walk the route
      if (this.wait > 0) {
        this.wait -= dt;
        this.moving = damp(this.moving, 0, 8, dt);
      } else {
        const tgt = this.path[this.i];
        const dx = tgt[0] - this.x, dz = tgt[1] - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          this.i = (this.i + 1) % this.path.length;
          this.wait = s.pause ?? rng.range(0.6, 2.6);
          if (s.kind === 'work') this.swing = 1;
        } else {
          this.facing = Math.atan2(dz, dx);
          this.x += (dx / d) * this.speed * dt;
          this.z += (dz / d) * this.speed * dt;
          this.moving = damp(this.moving, 1, 8, dt);
        }
      }
      if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 1.4);
    }

    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.pivot.rotation.y = -this.facing + Math.PI / 2;
    this.rig.update(dt, {
      moving: this.moving,
      attacking: this.swing,
      casting: 0, dead: 0, hurt: 0,
      speedFactor: 0.85,
      blocking: s.kind === 'spar' && this.swing <= 0,
    });
  }

  dispose(scene) { scene.remove(this.rig.root); this.rig.dispose(); }
}

export class AmbientCrowd {
  constructor(scene, specs = []) {
    this.scene = scene;
    this.actors = specs.map(s => new Actor(scene, s));
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    for (const a of this.actors) a.update(dt, this.t);
  }

  dispose() {
    for (const a of this.actors) a.dispose(this.scene);
    this.actors.length = 0;
  }
}
