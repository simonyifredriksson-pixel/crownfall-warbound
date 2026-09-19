/* EnemyAI.js — the enemy commander's brain.

   Not a script. The director reads the board every second and decides what
   the faction's doctrine says to do about it. Three things make it feel like
   an opponent rather than a spawner:

     1. IT REACTS. A big push on the left gets answered on the left. A wall of
        heavy armour gets answered with blunt damage if the faction has any.
     2. IT SAVES. Below `saveThreshold` it holds Command rather than trickling
        units in one at a time, then commits several at once.
     3. IT HAS A PLAN. Doctrine decides whether it contests control points,
        protects its casters, flanks, or simply walks forward forever.

   Difficulty comes from the deck and the level, never from cheating: the AI
   pays the same Command costs the player does.
*/

import { CFG } from '../core/Config.js';
import { UNITS } from '../data/Units.js';
import { FACTIONS } from '../data/Factions.js';
import { counterMult } from '../core/Config.js';
import { clamp, rng, TAU } from '../core/Util.js';

export class EnemyDirector {
  constructor(battle, cfg) {
    this.b = battle;
    this.faction = FACTIONS[cfg.faction] || FACTIONS.goblin;
    this.doctrine = this.faction.doctrine || {};
    this.deck = (cfg.deck || this.faction.roster || []).filter(id => UNITS[id]);
    this.level = cfg.level || 1;
    this.aggression = this.doctrine.aggression ?? 0.7;
    this.saveThreshold = this.doctrine.saveThreshold ?? 5;
    this.pushInterval = this.doctrine.pushInterval ?? 7;
    this.commandRegenMult = cfg.commandRegenMult ?? 1;

    this.thinkT = 0.6;
    this.pushT = 2.5;
    this.openingIdx = 0;
    this.opening = (this.doctrine.opening || []).filter(id => UNITS[id]);
    this.lastLane = 0;
    this.intentPreview = null;    // Farsight research reads this
  }

  /* ====================================================================== */

  update(dt) {
    const b = this.b;
    if (b.state !== 'running') return;

    this.thinkT -= dt;
    this.pushT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.8 + rng.range(0, 0.5);

    const cmd = b.command[1];

    /* ---- opening book: the first few deployments are scripted so the
            faction's identity lands immediately ---- */
    if (this.openingIdx < this.opening.length) {
      const id = this.opening[this.openingIdx];
      const u = UNITS[id];
      if (u && cmd >= u.cost) {
        const spot = this._spotFor(u, this._defaultLane());
        if (b.deploy(id, spot.x, spot.z, 1)) { this.openingIdx++; return; }
      }
      if (cmd < (UNITS[this.opening[this.openingIdx]]?.cost ?? 99)) return;
    }

    /* ---- emergency: something is at the banner ---- */
    const threatAtHome = this._threatNearOwnBanner();
    if (threatAtHome.length) {
      const answer = this._pickCounter(threatAtHome, cmd, true);
      if (answer) { this._deployAnswer(answer, threatAtHome); return; }
    }

    /* ---- contest control points when the doctrine cares ---- */
    if ((this.doctrine.holdPoints || rng.chance(0.3)) && cmd >= 3) {
      const losing = b.points.find(p => p.owner === 0);
      if (losing) {
        const pick = this._cheapestAffordable(cmd, ['melee', 'beast', 'cavalry', 'guardian']);
        if (pick) {
          const spot = this._spotNear(pick, losing.x, losing.z);
          if (b.deploy(pick.id, spot.x, spot.z, 1)) return;
        }
      }
    }

    /* ---- protect casters: if our backline is being hunted, answer it ---- */
    if (this.doctrine.protectCasters) {
      const hunted = b.units.filter(u => u.team === 1 && u.alive &&
        (u.role === 'caster' || u.role === 'support') &&
        b.enemiesNear(u, u.x, u.z, 9).length > 0);
      if (hunted.length && cmd >= 3) {
        const guard = this._pickFrom(['guardian', 'melee'], cmd);
        if (guard) {
          const h = hunted[0];
          const spot = this._spotNear(guard, h.x, h.z - 3);
          if (b.deploy(guard.id, spot.x, spot.z, 1)) return;
        }
      }
    }

    /* ---- the main push ---- */
    const holdingBack = cmd < this.saveThreshold && !this.doctrine.relentless;
    if (holdingBack && this.pushT > 0) return;

    if (this.pushT <= 0 || cmd >= CFG.battle.commandMax * 0.85 || rng.chance(this.aggression * 0.5)) {
      this._push(cmd);
    }
  }

  /* ---------------------------------------------------------------- push */

  _push(cmd) {
    const b = this.b;
    const lane = this._chooseLane();

    // spend up to three cards in one commitment so pushes arrive together
    let spent = 0;
    for (let i = 0; i < 3; i++) {
      const budget = cmd - spent;
      if (budget < 2) break;

      const playerUnits = b.units.filter(u => u.team === 0 && u.alive);
      const pick = playerUnits.length
        ? this._pickCounter(playerUnits, budget, false)
        : this._pickFrom(null, budget);

      if (!pick) break;
      const spot = this._spotFor(pick, lane);
      if (!b.deploy(pick.id, spot.x, spot.z, 1)) break;
      spent += pick.cost;
      if (!this.doctrine.preferSwarm && i >= 1) break;
    }

    if (spent > 0) {
      this.pushT = this.pushInterval * (0.7 + rng.range(0, 0.6));
      this.lastLane = lane;
    } else {
      this.pushT = 1.5;
    }
  }

  /* ------------------------------------------------------------ choosing */

  /** Which of our cards is best against what is actually on the field? */
  _pickCounter(enemies, budget, urgent) {
    const affordable = this.deck.map(id => UNITS[id]).filter(u => u && u.cost <= budget);
    if (!affordable.length) return null;

    // profile the enemy force
    const armorCount = {};
    let totalMass = 0, rangedShare = 0, count = 0;
    for (const e of enemies) {
      armorCount[e.armorType] = (armorCount[e.armorType] || 0) + 1;
      totalMass += e.mass;
      if (!e.isMelee) rangedShare++;
      count++;
    }
    const avgMass = count ? totalMass / count : 2;
    rangedShare = count ? rangedShare / count : 0;

    let best = null, bestScore = -Infinity;
    for (const u of affordable) {
      let score = 0;

      // damage-type fit against their armour mix
      for (const at in armorCount) score += counterMult(u.dmgType, at) * armorCount[at] * 12;

      // swarms want area damage
      if (count >= 6 && (u.splash || u.role === 'caster')) score += 30;
      // big single targets want anti-large or high single-target damage
      if (avgMass >= 3 && (u.tags?.includes('antilarge') || u.dmgType === 'blunt')) score += 34;
      // their ranged backline invites flankers
      if (rangedShare > 0.45 && (u.role === 'assassin' || u.role === 'flyer' || u.role === 'cavalry')) score += 28;
      // urgent defence wants bodies now, not artillery
      if (urgent && (u.role === 'siege' || u.minRange)) score -= 60;
      if (urgent && u.role === 'guardian') score += 24;

      // doctrine flavour
      if (this.doctrine.preferSwarm && (u.count || 1) > 1) score += 18;
      if (this.doctrine.preferBig && u.mass >= 3) score += 20;
      if (this.doctrine.preferFlank && (u.role === 'assassin' || u.moveSpeed > 5.5)) score += 18;
      if (this.doctrine.attrition && (u.role === 'summoner' || u.tags?.includes('undead'))) score += 16;
      if (this.doctrine.defensive && u.role === 'guardian') score += 22;

      // value for money, and a dose of noise so it is not deterministic
      score += (u.cost <= budget * 0.6 ? 10 : 0);
      score += rng.range(0, 18);

      if (score > bestScore) { bestScore = score; best = u; }
    }
    return best;
  }

  /** Drop a defensive answer right on top of whatever is at the banner. */
  _deployAnswer(unit, threats) {
    const b = this.b;
    let cx = 0, cz = 0;
    for (const t of threats) { cx += t.x; cz += t.z; }
    cx /= threats.length; cz /= threats.length;
    const spot = this._spotNear(unit, cx, cz);
    if (b.deploy(unit.id, spot.x, spot.z, 1)) {
      this.pushT = Math.max(this.pushT, 1.2);
      return true;
    }
    return false;
  }

  _pickFrom(roles, budget) {
    const pool = this.deck.map(id => UNITS[id])
      .filter(u => u && u.cost <= budget && (!roles || roles.includes(u.role)));
    if (!pool.length) return null;
    return rng.pick(pool);
  }

  _cheapestAffordable(budget, roles) {
    const pool = this.deck.map(id => UNITS[id])
      .filter(u => u && u.cost <= budget && (!roles || roles.includes(u.role)))
      .sort((a, b) => a.cost - b.cost);
    return pool[0] || null;
  }

  /* ------------------------------------------------------------ placement */

  _defaultLane() { return rng.chance(0.5) ? -1 : 1; }

  _chooseLane() {
    const b = this.b;
    // push where the player is weakest, most of the time
    let left = 0, right = 0;
    for (const u of b.units) {
      if (u.team !== 0 || !u.alive) continue;
      if (u.x < 0) left += u.threat(); else right += u.threat();
    }
    if (rng.chance(0.25)) return this._defaultLane();      // keep them guessing
    if (Math.abs(left - right) < 40) return 0;             // centre when even
    return left < right ? -1 : 1;
  }

  _spotFor(unit, lane) {
    const b = this.b;
    const line = b.deployLine[1];
    const laneX = lane === 0 ? rng.range(-5, 5) : lane * rng.range(8, 19);
    let z = line + rng.range(1, 5);

    // siege deploys as far back as it can get away with
    if (unit.role === 'siege') z = Math.max(line, CFG.field.bannerZ - 10) + rng.range(0, 4);
    // assassins and flyers come in wide
    if (unit.role === 'assassin' || unit.role === 'flyer') {
      return this._resolve(lane === 0 ? rng.sign() * rng.range(16, 24) : lane * rng.range(18, 25), z);
    }
    return this._resolve(laneX, z);
  }

  _spotNear(unit, x, z) {
    const b = this.b;
    const line = b.deployLine[1];
    return this._resolve(x + rng.range(-4, 4), Math.max(z, line) + rng.range(0, 4));
  }

  _resolve(x, z) {
    const b = this.b;
    const f = b.field;
    x = clamp(x, -f.W / 2 + 4, f.W / 2 - 4);
    z = clamp(z, b.deployLine[1] - 1, f.L / 2 - 3);
    const p = f.resolve(x, z);
    return { x: p.x, z: p.z };
  }

  _threatNearOwnBanner() {
    const b = this.b;
    const banner = b.structures(1).find(s => s.kind === 'banner');
    if (!banner) return [];
    return b.units.filter(u => u.team === 0 && u.alive &&
      Math.hypot(u.x - banner.x, u.z - banner.z) < 18);
  }

  /** What the AI intends next — surfaced by the Farsight research node. */
  preview() {
    if (!this.intentPreview) return null;
    return this.intentPreview;
  }
}
