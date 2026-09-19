/* Command.js — you are the commander, and the army does what you tell it.

   Before this, deploying a card put bodies on the field and they ran at the
   nearest enemy for the rest of the battle. You were a spectator with a
   sword. This is the system that makes them YOURS.

   THE MODEL

     One deployed card = one SQUAD. A squad has:
       - an ORDER   what it is trying to do
       - a FORMATION how it stands while doing it
       - an ANCHOR   the point the formation is built around

     Every frame each squad works out where its anchor is, lays its formation
     out around it, and hands each soldier a SLOT. A soldier walks to its slot
     and holds it — unless an enemy comes inside its reach, in which case it
     fights, and then returns. It will not chase beyond its LEASH.

   That last rule is the whole thing. A leash is what separates an army from
   a crowd: it is why a shield wall stays a wall instead of dissolving into
   nine individual duels the moment the fighting starts.

   ORDERS
     FOLLOW    keep formation on the commander, and move when they move
     HOLD      keep formation on a planted point, and do not leave it
     ADVANCE   walk the formation to a point, fighting what it meets
     CHARGE    formation off, leash off, everyone at the nearest enemy
     FALLBACK  retreat in order to the banner

   The enemy uses the same system, which is why an enemy army now arrives as
   a line instead of a trickle.
*/

import { getFormation } from '../data/Formations.js';
import { countAt } from '../data/Units.js';
import { bus, EV } from '../core/Bus.js';
import { clamp, damp, TAU } from '../core/Util.js';

export const ORDER = {
  FOLLOW: 'follow',
  HOLD: 'hold',
  ADVANCE: 'advance',
  CHARGE: 'charge',
  FALLBACK: 'fallback',
};

export const ORDER_INFO = {
  follow: { name: 'Follow Me', blurb: 'Keep station on the commander.', leash: 8.5 },
  hold: { name: 'Hold Ground', blurb: 'Stand here. Do not pursue.', leash: 6.5 },
  advance: { name: 'Advance', blurb: 'Walk to the mark, fighting what you meet.', leash: 10 },
  charge: { name: 'Charge', blurb: 'Break formation. Everyone forward.', leash: Infinity },
  fallback: { name: 'Fall Back', blurb: 'Withdraw to the banner, in order.', leash: 14 },
};

/* ========================================================================== */

export class Squad {
  /**
   * @param units the entities this card spawned — they live and die together
   */
  constructor(army, cardId, units, o = {}) {
    this.army = army;
    this.b = army.b;
    this.team = army.team;
    this.cardId = cardId;
    this.name = units[0]?.name || cardId;
    this.units = units;
    this.order = o.order || ORDER.FOLLOW;
    this.formationId = o.formation || army.formationId;
    this.anchor = { x: o.x ?? units[0]?.x ?? 0, z: o.z ?? units[0]?.z ?? 0 };
    this.facing = o.facing ?? (this.team === 0 ? Math.PI / 2 : -Math.PI / 2);
    this.mark = { x: this.anchor.x, z: this.anchor.z };
    this.formedT = 0;          // seconds spent actually in formation
    this.contactT = 0;         // time since the squad first touched an enemy

    for (const u of units) { u.squad = this; }
    this._assign();
  }

  get formation() { return getFormation(this.formationId); }
  get alive() { return this.units.some(u => u.alive); }
  get living() { return this.units.filter(u => u.alive); }

  /** Give each living soldier a slot index. Re-run when the squad loses men. */
  _assign() {
    const live = this.living;
    this.slots = this.formation.slots(Math.max(1, live.length));
    live.forEach((u, i) => { u.slotIndex = i; });
    this._slotCount = live.length;
  }

  setFormation(id) {
    if (this.formationId === id) return;
    this.formationId = id;
    this.formedT = 0;
    this._assign();
  }

  setOrder(kind, mark) {
    this.order = kind;
    if (mark) { this.mark.x = mark.x; this.mark.z = mark.z; }
    if (kind === ORDER.HOLD && !mark) {
      // plant where the squad currently stands
      const c = this.centre();
      this.mark.x = c.x; this.mark.z = c.z;
    }
    this.formedT = 0;
  }

  centre() {
    const live = this.living;
    if (!live.length) return { x: this.anchor.x, z: this.anchor.z };
    let x = 0, z = 0;
    for (const u of live) { x += u.x; z += u.z; }
    return { x: x / live.length, z: z / live.length };
  }

  /* ---------------------------------------------------------------- tick */

  update(dt) {
    const live = this.living;
    if (!live.length) return;
    if (live.length !== this._slotCount) this._assign();

    const b = this.b;
    const leader = this.army.leader;
    const enemyBanner = b.allStructures.find(s => s.kind === 'banner' && s.team !== this.team && s.alive);
    const ownBanner = b.allStructures.find(s => s.kind === 'banner' && s.team === this.team && s.alive);

    /* ---- where does the formation want to be, and facing which way? ---- */
    let want = null, wantFace = this.facing;

    if (this.order === ORDER.FOLLOW && leader?.alive) {
      // stand off in front of the commander, in the direction they face
      const off = this.army.stationOf(this);
      const c = Math.cos(leader.facing), s = Math.sin(leader.facing);
      want = {
        x: leader.x + c * off.z - s * off.x,
        z: leader.z + s * off.z + c * off.x,
      };
      wantFace = leader.facing;
    } else if (this.order === ORDER.HOLD) {
      want = { x: this.mark.x, z: this.mark.z };
      const t = this._nearestFoe();
      if (t) wantFace = Math.atan2(t.z - want.z, t.x - want.x);
      else if (enemyBanner) wantFace = Math.atan2(enemyBanner.z - want.z, enemyBanner.x - want.x);
    } else if (this.order === ORDER.ADVANCE) {
      want = { x: this.mark.x, z: this.mark.z };
      const c = this.centre();
      const d = Math.hypot(want.x - c.x, want.z - c.z);
      // walk the ANCHOR toward the mark so the whole formation moves together
      if (d > 1.2) {
        const spd = this.marchSpeed();
        const k = Math.min(1, (spd * dt) / d);
        this.anchor.x += (want.x - this.anchor.x) * k * 1.0;
        this.anchor.z += (want.z - this.anchor.z) * k * 1.0;
        wantFace = Math.atan2(want.z - c.z, want.x - c.x);
        want = { x: this.anchor.x, z: this.anchor.z };
      } else {
        const t = this._nearestFoe();
        if (t) wantFace = Math.atan2(t.z - c.z, t.x - c.x);
      }
    } else if (this.order === ORDER.FALLBACK && ownBanner) {
      want = { x: ownBanner.x, z: ownBanner.z + (this.team === 0 ? 6 : -6) };
      wantFace = Math.atan2(want.z - this.centre().z, want.x - this.centre().x);
    }

    if (this.order === ORDER.CHARGE) {
      // formation off entirely: every soldier is released
      for (const u of live) { u.slotGoal = null; u.leash = Infinity; u.formationMods = null; }
      this.formedT = 0;
      return;
    }

    if (want) {
      // the anchor eases toward the wanted point so the squad does not snap
      const rate = this.order === ORDER.FOLLOW ? 5.5 : 7;
      this.anchor.x = damp(this.anchor.x, want.x, rate, dt);
      this.anchor.z = damp(this.anchor.z, want.z, rate, dt);
    }
    // turning the formation is slower than turning a man — a squad wheels
    let dF = ((wantFace - this.facing + Math.PI * 3) % TAU) - Math.PI;
    this.facing += clamp(dF, -1.9 * dt, 1.9 * dt);

    /* ---- hand every soldier its slot ---- */
    const cos = Math.cos(this.facing), sin = Math.sin(this.facing);
    const leash = ORDER_INFO[this.order]?.leash ?? 8;
    let formed = 0;

    for (const u of live) {
      const s = this.slots[u.slotIndex] || { x: 0, z: 0 };
      // slot is authored with +Z forward; rotate it onto the squad's facing
      const gx = this.anchor.x + cos * s.z - sin * s.x;
      const gz = this.anchor.z + sin * s.z + cos * s.x;
      u.slotGoal = { x: gx, z: gz, facing: this.facing };
      u.leash = leash;
      if (Math.hypot(u.x - gx, u.z - gz) < 2.4) formed++;
    }

    /* ---- formation bonuses only apply to a squad that is ACTUALLY formed.
       A shield wall you have just ordered into existence is not a shield wall
       until the men are standing in it, and a wall that has been scattered
       stops being one.

       The band between the two thresholds matters: with a single cut-off, a
       squad WHEELING to face a new threat drops in and out of formation
       several times a second, because turning briefly pulls the outer files
       off their slots. Hysteresis keeps a formation that is merely turning
       from flickering. ---- */
    const ratio = formed / live.length;
    if (ratio > 0.6) this.formedT += dt;
    else if (ratio < 0.4) this.formedT = 0;
    // between 0.4 and 0.6 it simply holds whatever it had
    const active = this.formedT > 0.8;
    const mods = active ? this.formation.mods : null;
    for (const u of live) {
      u.formationMods = mods;
      u.formationFacing = active ? this.facing : null;
    }
  }

  marchSpeed() {
    const live = this.living;
    if (!live.length) return 0;
    let slowest = Infinity;
    for (const u of live) slowest = Math.min(slowest, u.moveSpeed);
    return slowest * (this.formation.speed ?? 1);
  }

  _nearestFoe() {
    const c = this.centre();
    let best = null, bd = 26 * 26;
    for (const e of this.b.units) {
      if (e.team === this.team || !e.alive || !e.ready) continue;
      const d = (e.x - c.x) ** 2 + (e.z - c.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
}

/* ========================================================================== */

/**
 * One army's worth of squads. The player has one; so does the enemy.
 */
export class ArmyCommand {
  constructor(battle, team, o = {}) {
    this.b = battle;
    this.team = team;
    this.squads = [];
    this.formationId = o.formation || 'line';
    this.order = o.order || ORDER.FOLLOW;
    this.leader = o.leader || null;
    this.selected = -1;            // -1 = the whole army
    this.lastMark = null;
  }

  /** Squads currently worth talking about. */
  get live() { return this.squads.filter(s => s.alive); }

  add(cardId, units, o = {}) {
    if (!units.length) return null;
    const sq = new Squad(this, cardId, units, {
      formation: this.formationId,
      order: this.order,
      x: units[0].x, z: units[0].z,
      facing: this.team === 0 ? Math.PI / 2 : -Math.PI / 2,
      ...o,
    });
    this.squads.push(sq);
    return sq;
  }

  /** Which squads an order applies to: the selection, or everything. */
  targetSquads() {
    const live = this.live;
    if (this.selected >= 0 && live[this.selected]) return [live[this.selected]];
    return live;
  }

  select(i) {
    const live = this.live;
    this.selected = (i === null || i < 0 || i >= live.length) ? -1 : i;
    return this.selected;
  }

  cycleSelection() {
    const live = this.live;
    if (!live.length) return -1;
    this.selected = this.selected + 1 >= live.length ? -1 : this.selected + 1;
    return this.selected;
  }

  issue(kind, mark) {
    const list = this.targetSquads();
    for (const s of list) s.setOrder(kind, mark);
    if (this.selected < 0) this.order = kind;
    this.lastMark = mark ? { ...mark, t: 1.6 } : null;
    if (list.length && this.team === 0) bus.emit(EV.ARMY_ORDER, { order: kind, squads: list.length });
    return list.length;
  }

  setFormation(id) {
    const list = this.targetSquads();
    for (const s of list) s.setFormation(id);
    if (this.selected < 0) this.formationId = id;
    if (list.length && this.team === 0) bus.emit(EV.ARMY_ORDER, { formation: id, squads: list.length });
    return list.length;
  }

  update(dt) {
    for (let i = this.squads.length - 1; i >= 0; i--) {
      const s = this.squads[i];
      if (!s.alive) { this.squads.splice(i, 1); continue; }
      s.update(dt);
    }
    if (this.selected >= this.live.length) this.selected = -1;
    if (this.lastMark) { this.lastMark.t -= dt; if (this.lastMark.t <= 0) this.lastMark = null; }
  }

  /**
   * Where a squad stands relative to the commander under FOLLOW.
   * Melee squads form up in front, shooters and casters behind — so
   * "follow me" produces a sensible battle line rather than a mob.
   * Local space: +Z is in front of the commander, +X is their right.
   */
  stationOf(squad) {
    const live = this.live;
    const front = [], back = [];
    for (const s of live) {
      const r = s.units[0]?.role;
      const ranged = r === 'ranged' || r === 'caster' || r === 'support' || r === 'siege' || r === 'summoner';
      (ranged ? back : front).push(s);
    }
    const inFront = front.includes(squad);
    const row = inFront ? front : back;
    const i = row.indexOf(squad);
    const n = Math.max(1, row.length);
    const spread = inFront ? 8.5 : 7.0;
    return {
      x: (i - (n - 1) / 2) * spread,
      z: inFront ? 7.5 : -6.0,
    };
  }
}
