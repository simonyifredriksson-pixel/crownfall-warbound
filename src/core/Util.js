/* Util.js — small, dependency-free helpers used everywhere. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => b === a ? 0 : (v - a) / (b - a);
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = t => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Frame-rate independent exponential approach. `rate` = how fast, in 1/s. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const approachAngle = (a, b, maxStep) => {
  const d = angleDelta(a, b);
  return a + clamp(d, -maxStep, maxStep);
};

/* ---------------------------------------------------------------- random */

/** Deterministic 32-bit PRNG (mulberry32). Same seed -> same world. */
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const r = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.sign = () => r() < 0.5 ? -1 : 1;
  /** Gaussian-ish, mean 0, roughly [-1,1]. */
  r.bell = () => (r() + r() + r()) / 1.5 - 1;
  r.shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  /** Weighted pick. `items` = [{w, ...}] or pass a weight accessor. */
  r.weighted = (items, wOf = x => x.w) => {
    let total = 0;
    for (const it of items) total += wOf(it) || 0;
    if (total <= 0) return items[0];
    let n = r() * total;
    for (const it of items) { n -= wOf(it) || 0; if (n <= 0) return it; }
    return items[items.length - 1];
  };
  return r;
}

/** Global non-deterministic rng for cosmetic things (particles, flavour). */
export const rng = makeRng((Math.random() * 0xffffffff) >>> 0);

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------------------------------------------------------- arrays */

export const uniq = a => [...new Set(a)];
export const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
export function groupBy(arr, keyOf) {
  const m = new Map();
  for (const x of arr) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
/** Remove by swapping with last — O(1), order not preserved. Used in hot loops. */
export function swapRemove(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}

/* ---------------------------------------------------------------- format */

export function formatNum(n) {
  n = Math.round(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return String(n);
}
export const commas = n => Math.round(n).toLocaleString('en-US');
export function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
export const pct = (v, digits = 0) => (v * 100).toFixed(digits) + '%';
export const signed = v => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10);
export const titleCase = s => s.replace(/(^|[\s-])(\w)/g, (_, a, b) => a + b.toUpperCase());

/** Escape for safe innerHTML interpolation of data-driven strings. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------- timing */

/** Rolling average, for the frame-time smoother. */
export class Rolling {
  constructor(n = 30) { this.n = n; this.buf = []; this.total = 0; }
  push(v) {
    this.buf.push(v); this.total += v;
    if (this.buf.length > this.n) this.total -= this.buf.shift();
    return this.avg;
  }
  get avg() { return this.buf.length ? this.total / this.buf.length : 0; }
}

/** Fires at most once per `ms`. */
export function throttle(fn, ms) {
  let last = 0, pending = null;
  return (...args) => {
    const now = performance.now();
    if (now - last >= ms) { last = now; fn(...args); }
    else if (!pending) {
      pending = setTimeout(() => { pending = null; last = performance.now(); fn(...args); }, ms - (now - last));
    }
  };
}

export const nextFrame = () => new Promise(r => requestAnimationFrame(r));
export const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- misc */

export function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k in o) out[k] = deepClone(o[k]);
  return out;
}

/** Shallow-merge `patch` into `base`, recursing into plain objects. */
export function deepMerge(base, patch) {
  for (const k in patch) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      deepMerge(base[k], v);
    } else base[k] = v;
  }
  return base;
}

/** Counter-map helpers — resources, materials and shards are all {id:qty}. */
export const bagGet = (bag, id) => bag[id] || 0;
export function bagAdd(bag, id, n) {
  if (!n) return bag;
  bag[id] = (bag[id] || 0) + n;
  if (bag[id] <= 0) delete bag[id];
  return bag;
}
export function bagHas(bag, cost) {
  for (const k in cost) if ((bag[k] || 0) < cost[k]) return false;
  return true;
}
export function bagPay(bag, cost) {
  if (!bagHas(bag, cost)) return false;
  for (const k in cost) bagAdd(bag, k, -cost[k]);
  return true;
}
export function bagMerge(bag, other) {
  for (const k in other) bagAdd(bag, k, other[k]);
  return bag;
}

/** Point-in-rect on the XZ plane. */
export const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Uniform point inside a circle. */
export function pointInDisc(r, rand = Math.random) {
  const a = rand() * TAU, d = Math.sqrt(rand()) * r;
  return { x: Math.cos(a) * d, z: Math.sin(a) * d };
}

/** Roman numerals for card tiers (I..X). */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = n => ROMAN[n] || String(n);
