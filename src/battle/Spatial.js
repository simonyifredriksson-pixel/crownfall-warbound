/* Spatial.js — a uniform grid for "what is near me".

   With up to ~90 units, two structures per side and constant radius queries
   (targeting, auras, splash, separation), a naive O(n²) scan is the single
   hottest thing in the frame. This flattens it to a handful of buckets.

   Rebuilt from scratch each frame — cheaper and far less bug-prone than
   incremental updates, and it is only a few thousand integer writes.
*/

import { CFG } from '../core/Config.js';

export class SpatialGrid {
  constructor(width, length, cell = CFG.battle.gridCell) {
    this.cell = cell;
    this.w = width; this.l = length;
    this.cols = Math.ceil(width / cell) + 2;
    this.rows = Math.ceil(length / cell) + 2;
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    this._scratch = [];
  }

  _col(x) { const c = Math.floor((x + this.w / 2) / this.cell) + 1; return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c; }
  _row(z) { const r = Math.floor((z + this.l / 2) / this.cell) + 1; return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r; }

  clear() { for (const b of this.buckets) b.length = 0; }

  insert(e) {
    this.buckets[this._row(e.z) * this.cols + this._col(e.x)].push(e);
  }

  rebuild(list) {
    this.clear();
    for (const e of list) if (e.alive) this.insert(e);
  }

  /**
   * Everything within `r` of (x,z). Returns a REUSED array — copy it if you
   * intend to hold onto the result past the next query.
   */
  query(x, z, r, out) {
    const res = out || this._scratch;
    res.length = 0;
    const c0 = this._col(x - r), c1 = this._col(x + r);
    const r0 = this._row(z - r), r1 = this._row(z + r);
    const r2 = r * r;
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const b = this.buckets[base + col];
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2) res.push(e);
        }
      }
    }
    return res;
  }

  /** Filtered variant that allocates — use outside the hot path. */
  queryFiltered(x, z, r, fn) {
    const out = [];
    const c0 = this._col(x - r), c1 = this._col(x + r);
    const r0 = this._row(z - r), r1 = this._row(z + r);
    const r2 = r * r;
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const b = this.buckets[base + col];
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2 && fn(e)) out.push(e);
        }
      }
    }
    return out;
  }

  /** Nearest entity passing `fn`, within `r`. */
  nearest(x, z, r, fn) {
    let best = null, bestD = r * r;
    const c0 = this._col(x - r), c1 = this._col(x + r);
    const r0 = this._row(z - r), r1 = this._row(z + r);
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const b = this.buckets[base + col];
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          const dx = e.x - x, dz = e.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD && fn(e)) { bestD = d2; best = e; }
        }
      }
    }
    return best;
  }
}
