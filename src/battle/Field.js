/* Field.js — the battlefield.

   Terrain is the quiet strategic layer. A field is a height grid plus three
   masks the sim queries constantly:

     height[]   drives unit Y, and a step of >1.2m counts as HIGH GROUND
                (+25% range, +20% damage for ranged units standing on it)
     blocked[]  water, chasms, rock — ground units path around, flyers do not
     cover[]    treelines and rubble — ranged damage INTO cover is cut 25%

   Presets change the shape of the fight, not just the scenery:
     open    — nothing stops a charge; cavalry and big pushes are strong
     bridge  — two crossings; swarms and area damage rule, cavalry is wasted
     ridge   — a central plateau; whoever owns it wins the ranged war
     forest  — cover everywhere; melee closes safely, archers are blunted
     canyon  — one narrow middle; the purest chokepoint fight in the game
     ruins   — scattered blockers and cover; flankers and assassins thrive
     crypt   — tight, dark, short sightlines; swarms and summons excel
     spire   — raised platforms over a drop; positioning is everything
*/

import * as THREE from '../../lib/three.module.js';
import { box, cyl, plane, ring, merge, meshOf, rock } from '../art/Geo.js';
import { PAL, MATS, ATMOS } from '../art/Palette.js';
import { shadeOf } from '../art/GearArt.js';
import * as Props from '../art/PropArt.js';
import { CFG } from '../core/Config.js';
import { makeRng, clamp, lerp, TAU, smoothstep } from '../core/Util.js';

const CELL = 2;   // metres per grid cell

export class Field {
  constructor(preset = 'open', opts = {}) {
    this.preset = preset;
    this.W = CFG.field.width;
    this.L = CFG.field.length;
    this.cols = Math.ceil(this.W / CELL) + 1;
    this.rows = Math.ceil(this.L / CELL) + 1;
    this.rng = makeRng(opts.seed ?? 12345);
    this.atmos = opts.atmos || 'greenmarch';

    this.height = new Float32Array(this.cols * this.rows);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.cover = new Uint8Array(this.cols * this.rows);

    this.group = new THREE.Group();
    this.animated = [];
    this.decor = [];

    this._generate();
    this._buildMesh();
    this._buildDecor();
  }

  /* ------------------------------------------------------------- lookups */

  idx(cx, cz) { return cz * this.cols + cx; }
  toCol(x) { return clamp(Math.round((x + this.W / 2) / CELL), 0, this.cols - 1); }
  toRow(z) { return clamp(Math.round((z + this.L / 2) / CELL), 0, this.rows - 1); }
  colX(c) { return c * CELL - this.W / 2; }
  rowZ(r) { return r * CELL - this.L / 2; }

  /** Bilinear height so units glide instead of stepping. */
  heightAt(x, z) {
    const fx = clamp((x + this.W / 2) / CELL, 0, this.cols - 1.001);
    const fz = clamp((z + this.L / 2) / CELL, 0, this.rows - 1.001);
    const c0 = Math.floor(fx), r0 = Math.floor(fz);
    const tx = fx - c0, tz = fz - r0;
    const h = this.height;
    const h00 = h[this.idx(c0, r0)], h10 = h[this.idx(c0 + 1, r0)];
    const h01 = h[this.idx(c0, r0 + 1)], h11 = h[this.idx(c0 + 1, r0 + 1)];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  isBlocked(x, z) {
    if (Math.abs(x) > this.W / 2 - 1 || Math.abs(z) > this.L / 2 - 1) return true;
    return !!this.blocked[this.idx(this.toCol(x), this.toRow(z))];
  }

  inCover(x, z) { return !!this.cover[this.idx(this.toCol(x), this.toRow(z))]; }

  /** High ground is measured against the field's own baseline, not absolute. */
  isHighGround(x, z) { return this.heightAt(x, z) >= this.highGroundAt; }

  inBounds(x, z) { return Math.abs(x) <= this.W / 2 - 1.5 && Math.abs(z) <= this.L / 2 - 1.5; }

  /** Push a position out of blocked terrain; used after knockback and leaps. */
  resolve(x, z, r = 0.4) {
    if (!this.isBlocked(x, z)) return { x, z };
    for (let step = 1; step <= 6; step++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const nx = x + Math.cos(a) * step * CELL, nz = z + Math.sin(a) * step * CELL;
        if (!this.isBlocked(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x: clamp(x, -this.W / 2 + 2, this.W / 2 - 2), z: clamp(z, -this.L / 2 + 2, this.L / 2 - 2) };
  }

  /* ---------------------------------------------------------- generation */

  _generate() {
    const r = this.rng;
    this.highGroundAt = 1.2;
    const H = this.height, B = this.blocked, C = this.cover;

    // base: gentle rolling noise, symmetric enough to be fair
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.colX(cx), z = this.rowZ(cz);
        let h = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.45
              + Math.sin(x * 0.19 + 1.3) * 0.2
              + Math.cos(z * 0.13) * 0.18;
        // flatten the deployment strips so spawns are never on a slope
        const edge = smoothstep((Math.abs(z) - this.L / 2 + 14) / 10);
        h *= 1 - edge * 0.8;
        H[this.idx(cx, cz)] = h;
      }
    }

    switch (this.preset) {
      case 'bridge': this._genBridge(); break;
      case 'ridge': this._genRidge(); break;
      case 'forest': this._genForest(); break;
      case 'canyon': this._genCanyon(); break;
      case 'ruins': this._genRuins(); break;
      case 'crypt': this._genCrypt(); break;
      case 'spire': this._genSpire(); break;
      default: this._genOpen(); break;
    }

    /* Guarantee the play space is actually playable. Two invariants that a
       generator must never be allowed to break:

       1. Both deployment strips are completely clear. A unit that spawns
          inside a rock is a unit that never reaches the battle, and the
          player has no way to see it coming.
       2. There is a walkable route from each banner to the other. A preset
          that accidentally walls off a lane produces a battle that cannot be
          won, which is far worse than an unfair one. */
    const deployFrom = Math.min(Math.abs(CFG.field.deployLineOwn) - 3, this.L / 2 - 6);
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const z = this.rowZ(cz), x = this.colX(cx);
        if (Math.abs(z) >= deployFrom) B[this.idx(cx, cz)] = 0;
        // a clear corridor straight down the middle to each banner
        if (Math.abs(x) < 4 && Math.abs(z) > this.L / 2 - 22) B[this.idx(cx, cz)] = 0;
      }
    }
    this._ensureConnected();
  }

  /**
   * Flood from the player's banner; if the enemy banner is not reachable,
   * carve the straightest corridor that fixes it. Runs once at generation.
   */
  _ensureConnected() {
    const start = [this.toCol(0), this.toRow(-CFG.field.bannerZ + 2)];
    const goal = [this.toCol(0), this.toRow(CFG.field.bannerZ - 2)];
    for (let attempt = 0; attempt < 4; attempt++) {
      const seen = this._flood(start);
      if (seen.has(goal[0] + ',' + goal[1])) return;
      // find the blocked row that separates the two halves and open a gap in it
      let gapZ = 0, bestOpen = -1;
      for (let cz = 1; cz < this.rows - 1; cz++) {
        let open = 0;
        for (let cx = 1; cx < this.cols - 1; cx++) if (!this.blocked[this.idx(cx, cz)]) open++;
        if (open <= bestOpen || bestOpen === -1) { if (open < (bestOpen === -1 ? 1e9 : bestOpen)) { bestOpen = open; gapZ = cz; } }
      }
      // open a 5-cell wide lane at a lane position that varies per attempt
      const laneX = this.toCol([0, -11, 11, -20][attempt] || 0);
      for (let cz = Math.max(1, gapZ - 6); cz <= Math.min(this.rows - 2, gapZ + 6); cz++) {
        for (let d = -2; d <= 2; d++) {
          const cx = Math.min(this.cols - 2, Math.max(1, laneX + d));
          this.blocked[this.idx(cx, cz)] = 0;
          if (this.height[this.idx(cx, cz)] < 0) this.height[this.idx(cx, cz)] = 0.15;
        }
      }
    }
  }

  _flood([sc, sr]) {
    const seen = new Set([sc + ',' + sr]);
    const q = [[sc, sr]];
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 1 || nr < 1 || nc >= this.cols - 1 || nr >= this.rows - 1) continue;
        const k = nc + ',' + nr;
        if (seen.has(k) || this.blocked[this.idx(nc, nr)]) continue;
        seen.add(k);
        q.push([nc, nr]);
      }
    }
    return seen;
  }

  _genOpen() {
    const r = this.rng;
    this.features = [];
    // two low hillocks off-centre — soft high ground without a hard lane
    for (const [hx, hz] of [[-12, -8], [13, 9]]) {
      this._raise(hx, hz, 9, 1.5);
      this.features.push({ kind: 'hill', x: hx, z: hz, r: 9 });
    }
    // scattered boulders as micro-cover
    for (let i = 0; i < 10; i++) {
      const x = r.range(-22, 22), z = r.range(-26, 26);
      if (Math.abs(z) < 6 && Math.abs(x) < 6) continue;
      this._markCover(x, z, 2.4);
      this.features.push({ kind: 'rock', x, z, size: r.range(0.7, 1.5) });
    }
    for (let i = 0; i < 12; i++) {
      this.features.push({ kind: 'tree', x: r.range(-26, 26), z: r.range(-40, 40), style: 'round' });
    }
  }

  _genBridge() {
    const r = this.rng;
    this.features = [];
    // river across the middle
    for (let cz = 0; cz < this.rows; cz++) {
      const z = this.rowZ(cz);
      const bank = Math.abs(z) < 7 ? 1 : 0;
      if (!bank) continue;
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.colX(cx);
        const depth = -2.2 * (1 - Math.abs(z) / 7);
        this.height[this.idx(cx, cz)] = depth;
        this.blocked[this.idx(cx, cz)] = 1;
      }
    }
    // two crossings
    this.bridges = [{ x: -11, w: 7 }, { x: 11, w: 7 }];
    for (const b of this.bridges) {
      for (let cz = 0; cz < this.rows; cz++) {
        const z = this.rowZ(cz);
        if (Math.abs(z) > 8) continue;
        for (let cx = 0; cx < this.cols; cx++) {
          const x = this.colX(cx);
          if (Math.abs(x - b.x) > b.w / 2) continue;
          this.height[this.idx(cx, cz)] = 0.15;
          this.blocked[this.idx(cx, cz)] = 0;
        }
      }
      this.features.push({ kind: 'bridge', x: b.x, z: 0, len: 17, w: b.w });
    }
    this.features.push({ kind: 'water', x: 0, z: 0, w: this.W, d: 14, y: -0.65 });
    for (let i = 0; i < 14; i++)
      this.features.push({ kind: 'tree', x: r.range(-26, 26), z: r.sign() * r.range(12, 40), style: 'round' });
    this.chokepoints = this.bridges.map(b => ({ x: b.x, z: 0, r: 6 }));
  }

  _genRidge() {
    const r = this.rng;
    this.features = [];
    // a plateau across the middle with ramps at the edges
    for (let cz = 0; cz < this.rows; cz++) {
      const z = this.rowZ(cz);
      const band = 1 - clamp(Math.abs(z) / 13, 0, 1);
      if (band <= 0) continue;
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.colX(cx);
        // notch the plateau at the centre so it is not a wall
        const gap = clamp((Math.abs(x) - 4) / 6, 0, 1);
        this.height[this.idx(cx, cz)] += smoothstep(band) * 2.4 * gap;
      }
    }
    this.highGroundAt = 1.4;
    this.features.push({ kind: 'plateau', x: 0, z: 0 });
    for (let i = 0; i < 9; i++) {
      const x = r.range(-24, 24), z = r.sign() * r.range(16, 38);
      this.features.push({ kind: 'tree', x, z, style: 'round' });
    }
    for (let i = 0; i < 8; i++) {
      const x = r.range(-24, 24), z = r.range(-11, 11);
      this.features.push({ kind: 'rock', x, z, size: r.range(0.6, 1.2) });
      this._markCover(x, z, 2);
    }
  }

  _genForest() {
    const r = this.rng;
    this.features = [];
    // three dense stands of trees: real cover, and they shape the lanes
    const stands = [[-14, -10, 9], [15, 8, 9], [0, 0, 7], [-16, 16, 7], [16, -16, 7]];
    for (const [sx, sz, sr] of stands) {
      this._markCover(sx, sz, sr);
      const n = Math.round(sr * 1.6);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, TAU), d = Math.sqrt(r()) * sr;
        this.features.push({ kind: 'tree', x: sx + Math.cos(a) * d, z: sz + Math.sin(a) * d, style: r.chance(0.3) ? 'pine' : 'round' });
      }
    }
    for (let i = 0; i < 20; i++)
      this.features.push({ kind: 'bush', x: r.range(-26, 26), z: r.range(-40, 40) });
    this._raise(-10, 12, 8, 1.4);
    this._raise(11, -13, 8, 1.4);
  }

  _genCanyon() {
    const r = this.rng;
    this.features = [];
    // walls that pinch toward the middle
    for (let cz = 0; cz < this.rows; cz++) {
      const z = this.rowZ(cz);
      const pinch = 1 - clamp(Math.abs(z) / 24, 0, 1);
      const openW = lerp(this.W * 0.86, 15, smoothstep(pinch));
      for (let cx = 0; cx < this.cols; cx++) {
        const x = this.colX(cx);
        if (Math.abs(x) > openW / 2) {
          this.height[this.idx(cx, cz)] = 4.5 + (Math.abs(x) - openW / 2) * 0.35;
          this.blocked[this.idx(cx, cz)] = 1;
        }
      }
      if (Math.abs(z) < 26 && cz % 3 === 0) {
        this.features.push({ kind: 'cliff', x: openW / 2 + 1.5, z, h: 5 + r.range(0, 2) });
        this.features.push({ kind: 'cliff', x: -openW / 2 - 1.5, z, h: 5 + r.range(0, 2) });
      }
    }
    this.chokepoints = [{ x: 0, z: 0, r: 9 }];
    for (let i = 0; i < 10; i++) {
      const x = r.range(-8, 8), z = r.range(-30, 30);
      this.features.push({ kind: 'rock', x, z, size: r.range(0.8, 1.8) });
      this._markCover(x, z, 2.4);
    }
  }

  _genRuins() {
    const r = this.rng;
    this.features = [];
    // a grid of broken pillars — blockers you can hide behind and shoot past
    for (let i = -2; i <= 2; i++) {
      for (let j = -3; j <= 3; j++) {
        if (r.chance(0.35)) continue;
        const x = i * 10 + r.range(-2, 2), z = j * 9 + r.range(-2, 2);
        if (Math.abs(z) > 34) continue;
        const broken = r.chance(0.55);
        this.features.push({ kind: 'pillar', x, z, h: broken ? r.range(2, 3.5) : r.range(4, 6), broken });
        this._block(x, z, 1.6);
        this._markCover(x, z, 3.2);
      }
    }
    this._raise(0, 0, 11, 1.6);
    for (let i = 0; i < 8; i++)
      this.features.push({ kind: 'rubble', x: r.range(-24, 24), z: r.range(-34, 34) });
    for (let i = 0; i < 6; i++)
      this.features.push({ kind: 'tree', x: r.range(-26, 26), z: r.range(-40, 40), style: 'dead' });
  }

  _genCrypt() {
    const r = this.rng;
    this.features = [];
    // walled corridors: two side aisles and a nave
    for (let cz = 0; cz < this.rows; cz++) {
      const z = this.rowZ(cz);
      if (Math.abs(z) > 30) continue;
      for (const wx of [-9, 9]) {
        for (let cx = 0; cx < this.cols; cx++) {
          const x = this.colX(cx);
          if (Math.abs(x - wx) > 1.2) continue;
          // gaps every 14m so it is not three separate battles
          if (Math.abs((z + 7) % 18) < 5) continue;
          this.height[this.idx(cx, cz)] = 3.2;
          this.blocked[this.idx(cx, cz)] = 1;
        }
      }
    }
    for (let z = -28; z <= 28; z += 6) {
      for (const wx of [-9, 9]) {
        if (Math.abs((z + 7) % 18) < 5) continue;
        this.features.push({ kind: 'wall', x: wx, z, len: 6, h: 3.2 });
      }
    }
    for (let i = 0; i < 26; i++) {
      const x = r.range(-24, 24), z = r.range(-32, 32);
      if (Math.abs(Math.abs(x) - 9) < 2.5) continue;
      this.features.push({ kind: 'grave', x, z });
    }
    for (let i = 0; i < 8; i++)
      this.features.push({ kind: 'pillar', x: r.sign() * r.range(14, 24), z: r.range(-30, 30), h: r.range(3, 5), broken: r.chance(0.5) });
    this.chokepoints = [{ x: 0, z: 0, r: 8 }, { x: -16, z: 0, r: 6 }, { x: 16, z: 0, r: 6 }];
  }

  _genSpire() {
    const r = this.rng;
    this.features = [];
    // raised platforms over a drop: falling off is not possible, but the low
    // ground is exposed and the platforms are high ground
    const plats = [
      [0, 0, 10], [-15, -12, 7], [15, 12, 7], [-16, 13, 6], [16, -13, 6],
    ];
    for (const [px, pz, pr] of plats) {
      this._raise(px, pz, pr, 3.0, true);
      this.features.push({ kind: 'platform', x: px, z: pz, r: pr });
    }
    this.highGroundAt = 1.8;
    for (let i = 0; i < 12; i++) {
      this.features.push({ kind: 'pillar', x: r.range(-25, 25), z: r.range(-34, 34), h: r.range(4, 8), broken: r.chance(0.4) });
    }
    for (let i = 0; i < 6; i++) {
      const x = r.range(-22, 22), z = r.range(-30, 30);
      this.features.push({ kind: 'crystal', x, z, h: r.range(1.5, 3.5) });
      this._markCover(x, z, 2);
    }
  }

  /* ---------------------------------------------------------- mask utils */

  _raise(x, z, radius, amount, flatTop = false) {
    const c0 = this.toCol(x - radius), c1 = this.toCol(x + radius);
    const r0 = this.toRow(z - radius), r1 = this.toRow(z + radius);
    for (let cz = r0; cz <= r1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const dx = this.colX(cx) - x, dz = this.rowZ(cz) - z;
        const d = Math.hypot(dx, dz) / radius;
        if (d > 1) continue;
        const f = flatTop ? smoothstep((1 - d) * 3) : smoothstep(1 - d);
        this.height[this.idx(cx, cz)] += amount * f;
      }
    }
  }

  _block(x, z, radius) {
    const c0 = this.toCol(x - radius), c1 = this.toCol(x + radius);
    const r0 = this.toRow(z - radius), r1 = this.toRow(z + radius);
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++) {
        const dx = this.colX(cx) - x, dz = this.rowZ(cz) - z;
        if (Math.hypot(dx, dz) <= radius) this.blocked[this.idx(cx, cz)] = 1;
      }
  }

  _markCover(x, z, radius) {
    const c0 = this.toCol(x - radius), c1 = this.toCol(x + radius);
    const r0 = this.toRow(z - radius), r1 = this.toRow(z + radius);
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++) {
        const dx = this.colX(cx) - x, dz = this.rowZ(cz) - z;
        if (Math.hypot(dx, dz) <= radius) this.cover[this.idx(cx, cz)] = 1;
      }
  }

  /* ------------------------------------------------------------- terrain */

  _buildMesh() {
    const atm = ATMOS[this.atmos] || ATMOS.greenmarch;
    const segX = this.cols - 1, segZ = this.rows - 1;
    const geo = new THREE.PlaneGeometry(this.W, this.L, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(atm.ground);
    const dark = new THREE.Color(shadeOf(atm.ground, 0.62));
    const high = new THREE.Color(shadeOf(atm.ground, 1.22));
    const dirtC = new THREE.Color(PAL.dirt);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const cx = this.toCol(x), cz = this.toRow(z);
      const h = this.height[this.idx(cx, cz)];
      pos.setY(i, h);

      // Colour noise. The frequencies are deliberately incommensurate and the
      // terms are summed rather than multiplied: a product of two sines on a
      // regular grid produces a visible checkerboard, which is exactly what
      // this looked like before.
      const n = (Math.sin(x * 0.37 + z * 0.19) * 0.55
        + Math.sin(x * 0.11 - z * 0.83) * 0.3
        + Math.sin((x + z) * 1.31) * 0.15) * 0.07;
      c.copy(base);
      if (h < -0.4) c.lerp(dark, clamp(-h / 2.2, 0, 1));
      else if (h > 1.0) c.lerp(high, clamp((h - 1) / 2.4, 0, 0.7));
      if (this.cover[this.idx(cx, cz)]) c.lerp(dark, 0.3);
      if (this.blocked[this.idx(cx, cz)] && h > 0.5) c.lerp(new THREE.Color(PAL.stone), 0.55);
      // worn paths down the middle of the field
      const path = Math.exp(-Math.pow(x / 7, 2)) * 0.35;
      c.lerp(dirtC, path);
      c.offsetHSL(0, 0, n);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, MATS.terrain);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.terrainMesh = mesh;
    this.group.add(mesh);

    // a wide skirt so the world does not visibly end at the play area
    const skirt = new THREE.Mesh(
      plane(this.W * 6, this.L * 4, { color: shadeOf(atm.ground, 0.72), rx: -Math.PI / 2 }),
      MATS.terrain);
    skirt.position.y = -0.6;
    skirt.receiveShadow = false;
    this.group.add(skirt);
  }

  /* --------------------------------------------------------------- decor */

  _buildDecor() {
    const r = this.rng;
    const atm = ATMOS[this.atmos] || ATMOS.greenmarch;
    const leaf = this.atmos === 'ashenwaste' ? 0x6a5a3a
      : this.atmos === 'hollowmere' ? 0x4a5a52
        : this.atmos === 'stormspire' ? 0x4a4a62 : PAL.grassDark;

    for (const f of this.features || []) {
      let obj = null;
      switch (f.kind) {
        case 'tree':
          obj = Props.tree({ rand: r, style: f.style, leaf, trunk: PAL.woodDark, height: r.range(4, 7) });
          break;
        case 'bush': obj = Props.bush({ rand: r, color: leaf }); break;
        case 'rock': obj = Props.boulder({ rand: r, size: f.size, color: PAL.stone }); break;
        case 'rubble':
          obj = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const b = Props.boulder({ rand: r, size: r.range(0.3, 0.7), color: shadeOf(PAL.stone, 0.9) });
            b.position.set(r.range(-1.4, 1.4), 0, r.range(-1.4, 1.4));
            obj.add(b);
          }
          break;
        case 'pillar': obj = Props.ruinPillar({ rand: r, height: f.h, broken: f.broken }); break;
        case 'grave': obj = Props.gravestone({ rand: r }); break;
        case 'wall': obj = Props.wallSegment(f.len, f.h, { color: shadeOf(PAL.stone, 0.88) }); break;
        case 'cliff':
          obj = Props.boulder({ rand: r, size: r.range(2.2, 3.4), color: shadeOf(PAL.stone, 0.92) });
          obj.scale.set(1, f.h / 3, 1.6);
          break;
        case 'bridge':
          obj = Props.bridge(f.len, f.w, {});
          break;
        case 'water': {
          const w = Props.waterPlane(f.w * 1.2, f.d, { y: f.y });
          this.animated.push(w);
          this.group.add(w);
          w.position.set(0, f.y, 0);
          continue;
        }
        case 'crystal': {
          obj = meshOf([
            cyl(0.18, 0.28, f.h, 5, { color: 0x6a5a96, y: f.h / 2 }),
            cyl(0.0, 0.18, f.h * 0.4, 5, { color: PAL.arcane, y: f.h * 1.1 }),
          ], MATS.body);
          const gl = meshOf([cyl(0.0, 0.14, f.h * 0.4, 5, { color: PAL.arcane, y: f.h * 1.1, grad: 0 })], MATS.glow, { castShadow: false });
          obj.add(gl);
          break;
        }
        case 'platform': case 'plateau': case 'hill': default:
          continue;
      }
      if (!obj) continue;
      obj.position.set(f.x, this.heightAt(f.x, f.z) - 0.1, f.z);
      obj.rotation.y = r.range(0, TAU);
      this.group.add(obj);
      this.decor.push(obj);
      if (obj.userData && obj.userData.update) this.animated.push(obj);
    }
  }

  /* ------------------------------------------------------- deployment UI */

  /** Ground plane markers for the player's deploy zone. */
  makeDeployZone(team) {
    const g = new THREE.Group();
    const sign = team === 0 ? -1 : 1;
    const col = team === 0 ? PAL.teamPlayerGlow : PAL.teamEnemyGlow;

    const mat = MATS.emissive(col, 0.13).clone();
    mat.transparent = true;
    const quad = new THREE.Mesh(plane(this.W - 2, 1, { color: col, rx: -Math.PI / 2, grad: 0 }), mat);
    quad.position.y = 0.05;
    quad.renderOrder = 2;
    g.add(quad);

    const lineMat = MATS.emissive(col, 0.7).clone();
    lineMat.transparent = true;
    const line = new THREE.Mesh(plane(this.W - 2, 0.35, { color: col, rx: -Math.PI / 2, grad: 0 }), lineMat);
    line.position.y = 0.07;
    line.renderOrder = 3;
    g.add(line);

    g.userData.set = (frontZ) => {
      const backZ = sign * (this.L / 2 - 1);
      const depth = Math.abs(frontZ - backZ);
      quad.scale.set(1, depth, 1);
      quad.position.z = (frontZ + backZ) / 2;
      line.position.z = frontZ;
    };
    g.visible = false;
    this.group.add(g);
    return g;
  }

  update(dt, t) {
    for (const a of this.animated) if (a.userData.update) a.userData.update(t);
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose && o.material !== MATS.terrain && o.material !== MATS.body) o.material.dispose();
    });
  }
}

/* ==========================================================================
   STRUCTURES — banners, towers, control points
   ========================================================================== */

export class Structure {
  constructor(o) {
    Object.assign(this, {
      id: o.id, kind: o.kind, team: o.team, x: o.x, z: o.z,
      hp: o.hp, maxHp: o.hp, alive: true,
      radius: o.radius ?? 2.6, armorType: 'structure', armor: o.armor ?? 12,
      isStructure: true, mass: 9, name: o.name || o.kind,
      statuses: [], mods: { dmgTakenMult: 1, armorAdd: 0, ccImmune: true },
      range: o.range ?? 0, dmg: o.dmg ?? 0, atkSpeed: o.atkSpeed ?? 0,
      cooldown: 0, target: null,
      auraArmor: 0, auraDmgTaken: 1, auraDmgMult: 1, auraMagicResist: 1,
      auraAtkSpeed: 1, auraStructureMult: 1,
    });
    this.y = 0;
  }
  get hp01() { return clamp(this.hp / this.maxHp, 0, 1); }

  /* Structures take part in the status system so that nothing which handles a
     generic "target" has to special-case them. Almost everything is refused —
     you cannot stun a wall — but Fortified is real and the calls are safe. */
  hasStatus(id) { return this.statuses.some(s => s.id === id); }
  getStatus(id) { return this.statuses.find(s => s.id === id); }
  removeStatus(id) { const i = this.statuses.findIndex(s => s.id === id); if (i >= 0) this.statuses.splice(i, 1); }
  cleanse() { this.statuses = this.statuses.filter(s => !s.debuff); }

  addStatus(id, dur, data = {}) {
    // structures are immune to control and to damage-over-time bleed effects
    if (!STRUCTURE_STATUSES.has(id)) return null;
    let st = this.statuses.find(s => s.id === id);
    if (st) { st.t = Math.max(st.t, dur); return st; }
    st = { id, t: dur, max: dur, stacks: data.stacks || 1, src: data.src || null, debuff: false, acc: 0 };
    this.statuses.push(st);
    return st;
  }

  isFlankedBy() { return false; }
  threat() { return this.dmg * this.atkSpeed; }
}

/** The only conditions a wall can meaningfully be under. */
const STRUCTURE_STATUSES = new Set(['burning', 'fortified', 'sundered', 'oiled']);

export function makeStructures(field, o = {}) {
  const list = [];
  const bz = CFG.field.bannerZ, tz = CFG.field.towerZ, tx = CFG.field.towerX;
  const S = CFG.structures;

  for (const team of [0, 1]) {
    const sign = team === 0 ? -1 : 1;
    list.push(new Structure({
      id: `banner${team}`, kind: 'banner', team, x: 0, z: sign * bz,
      hp: Math.round(S.bannerHp * (o.hpMult || 1)), radius: 3.2, armor: 14, name: team === 0 ? 'Your Banner' : 'Enemy Banner',
    }));
    for (const sx of [-1, 1]) {
      list.push(new Structure({
        id: `tower${team}_${sx > 0 ? 'r' : 'l'}`, kind: 'tower', team,
        x: sx * tx, z: sign * tz,
        hp: Math.round(S.towerHp * (o.hpMult || 1)), radius: 2.0, armor: 18,
        range: S.towerRange, dmg: S.towerDps / S.towerAttackSpeed, atkSpeed: S.towerAttackSpeed,
        name: 'Watchtower',
      }));
    }
  }
  return list;
}

export function makeControlPoints(field) {
  const pts = [
    { id: 'cp_mid', name: 'The Crossing', x: 0, z: 0 },
    { id: 'cp_left', name: 'West Ground', x: -17, z: -4 },
    { id: 'cp_right', name: 'East Ground', x: 17, z: 4 },
  ];
  return pts.map(p => ({
    ...p,
    owner: -1, progress: 0, contested: false,
    radius: CFG.cp.radius,
    y: field.heightAt(p.x, p.z),
  }));
}
