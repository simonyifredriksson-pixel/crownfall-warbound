/* WaveDirector.js — scripted, teachable battles.

   The normal `EnemyDirector` is a real opponent: it reads the board and spends
   Command as it likes. That is the right thing for the campaign and exactly
   the wrong thing for someone's first five minutes, because nothing that
   happens is repeatable and nothing can be explained while it happens.

   A wave battle is the teaching mode. It:
     - sends a KNOWN group of enemies,
     - waits for the player to kill them,
     - says one sentence about what just happened,
     - and only then sends the next group.

   It exposes the same surface as EnemyDirector (`update`, `preview`,
   `commandRegenMult`), so Battle swaps one for the other and nothing else in
   the game needs to know which is running.
*/

import { UNITS, countAt } from '../data/Units.js';
import { getFormation } from '../data/Formations.js';
import { CFG } from '../core/Config.js';
import { clamp, rng } from '../core/Util.js';

export class WaveDirector {
  /**
   * @param cfg.waves  [{ units:[id,...], name, teach, gap, at }]
   *                   `at` is an optional [x,z] lane hint in field units
   * @param cfg.leadIn seconds before wave 1 arrives
   */
  constructor(battle, cfg = {}) {
    this.b = battle;
    this.waves = (cfg.waves || []).map(w => ({
      ...w,
      units: (w.units || []).filter(id => UNITS[id]),
    }));
    this.idx = -1;
    this.phase = this.waves.length ? 'lead-in' : 'done';
    this.wait = cfg.leadIn ?? 4.0;
    this.spawned = [];
    this.commandRegenMult = 1;
    this.intentPreview = null;
    this.isWaveMode = true;
  }

  get wave() { return this.waves[this.idx] || null; }
  get total() { return this.waves.length; }
  /** 1-based, for the HUD. 0 before the first wave lands. */
  get shown() { return Math.max(0, this.idx + 1); }

  update(dt) {
    const b = this.b;
    if (b.state !== 'running' || this.phase === 'done') return;

    if (this.phase === 'lead-in' || this.phase === 'gap') {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.idx++;
      if (this.idx >= this.waves.length) {
        this.phase = 'done';
        b.winByWaves();
        return;
      }
      this._send(this.waves[this.idx]);
      this.phase = 'fighting';
      return;
    }

    /* fighting — a wave is over when everything it sent is dead. Corpses
       linger and `alive` is what the rest of the sim uses, so this is the
       same definition of "dead" the player sees. */
    if (this.spawned.some(u => u.alive)) return;

    this.phase = 'gap';
    this.wait = this.wave?.gap ?? 5.5;
    b.onWaveCleared(this.idx + 1, this.waves.length, this.wave);
  }

  _send(w) {
    const b = this.b;
    this.spawned = [];

    const line = b.deployLine[1];
    const lanes = w.units.length;
    const lvl = w.level || b.opts.enemy?.level || 1;
    const form = getFormation(w.formation || b.foeArmy?.formationId || 'line');

    w.units.forEach((id, i) => {
      const u = UNITS[id];
      // spread the wave across the field so it reads as a battle line rather
      // than a pile, and so the player can see it coming
      const spreadX = lanes === 1 ? 0 : (i / (lanes - 1) - 0.5) * Math.min(26, lanes * 7);
      const x = clamp(spreadX + rng.range(-1.4, 1.4), -b.field.W / 2 + 5, b.field.W / 2 - 5);
      const z = clamp(line + 3 + rng.range(0, 3), line, b.field.L / 2 - 4);

      // every card the enemy fields is a SQUAD too, laid out in formation
      const count = countAt(u, lvl);
      const slots = form.slots(count);
      const face = -Math.PI / 2;
      const cos = Math.cos(face), sin = Math.sin(face);
      const made = [];
      for (let k = 0; k < count; k++) {
        const s = slots[k] || { x: 0, z: 0 };
        const e = b.spawn(id, 1, x + cos * s.z - sin * s.x, z + sin * s.z + cos * s.x, { lvl });
        if (e) { made.push(e); this.spawned.push(e); }
      }
      if (made.length) b.foeArmy?.add(id, made, { x, z, facing: face });
    });

    b.onWaveStart(this.idx + 1, this.waves.length, w);
  }

  /** The Farsight research node reads this; a wave battle is honest about it. */
  preview() {
    const next = this.waves[this.idx + 1];
    if (!next) return null;
    return { units: next.units, label: next.name || `Wave ${this.idx + 2}` };
  }
}
