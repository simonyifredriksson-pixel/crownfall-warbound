/* Geo.js — procedural geometry toolkit.

   Everything in the game is built from primitives at runtime; there are no
   model files. The performance trick that makes that viable is here: every
   primitive carries its colour in a vertex-colour attribute, so an entire
   limb — or an entire building — merges into ONE BufferGeometry sharing ONE
   material, and draws in one call.

   A fielded unit ends up as 5–6 meshes (body, two arms, two legs, glow)
   instead of forty. Sixty units on screen stays comfortably interactive.

   three.module.js is the CORE build: BufferGeometryUtils lives in addons and
   is not available, so `merge()` below is written by hand.
*/

import * as THREE from '../../lib/three.module.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/* ------------------------------------------------------------- primitives */

/**
 * Every primitive takes the same options bag:
 *   { x,y,z, rx,ry,rz, sx,sy,sz, color, taper, bend }
 * and returns a geometry already transformed into place with vertex colours
 * baked in, ready to merge.
 */
function finish(geo, o) {
  const color = o.color === undefined ? 0xffffff : o.color;
  _c.set(color);
  if (o.shade) _c.multiplyScalar(o.shade);

  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const pos = geo.attributes.position;

  // Subtle vertical gradient on every piece: cheap, and it makes flat-shaded
  // primitives read as volumes instead of coloured boxes.
  const grad = o.grad === undefined ? 0.14 : o.grad;
  let minY = Infinity, maxY = -Infinity;
  if (grad) {
    for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const span = maxY - minY || 1;

  for (let i = 0; i < n; i++) {
    let r = _c.r, g = _c.g, b = _c.b;
    if (grad) {
      const t = (pos.getY(i) - minY) / span;
      const f = 1 - grad * 0.5 + grad * t;
      r *= f; g *= f; b *= f;
    }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // transform
  if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) {
    geo.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  }
  if (o.rx) geo.rotateX(o.rx);
  if (o.ry) geo.rotateY(o.ry);
  if (o.rz) geo.rotateZ(o.rz);
  if (o.x || o.y || o.z) geo.translate(o.x || 0, o.y || 0, o.z || 0);

  return geo;
}

export function box(w, h, d, o = {}) {
  return finish(new THREE.BoxGeometry(w, h, d, o.seg || 1, o.seg || 1, o.seg || 1), o);
}

/** A box whose top face is scaled — the workhorse for tapered armour plates. */
export function taperBox(w, h, d, topScale, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * topScale); pos.setZ(i, pos.getZ(i) * topScale); }
  }
  g.computeVertexNormals();
  return finish(g, o);
}

export function cyl(rTop, rBot, h, seg, o = {}) {
  return finish(new THREE.CylinderGeometry(rTop, rBot, h, seg || 8, 1, !!o.open), o);
}

export function sphere(r, seg, o = {}) {
  return finish(new THREE.SphereGeometry(r, seg || 10, Math.max(4, (seg || 10) >> 1)), o);
}

export function cone(r, h, seg, o = {}) {
  return finish(new THREE.ConeGeometry(r, h, seg || 8), o);
}

export function torus(r, tube, o = {}) {
  return finish(new THREE.TorusGeometry(r, tube, o.rseg || 6, o.tseg || 12), o);
}

export function plane(w, h, o = {}) {
  return finish(new THREE.PlaneGeometry(w, h, o.segW || 1, o.segH || 1), o);
}

export function ring(rIn, rOut, seg, o = {}) {
  return finish(new THREE.RingGeometry(rIn, rOut, seg || 24), o);
}

/** An extruded polygon on the XY plane — blades, shield faces, banners. */
export function shape(points, depth, o = {}) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevelSize || 0.01, bevelThickness: o.bevelThickness || 0.01, bevelSegments: 1, steps: 1 });
  g.center();
  return finish(g, o);
}

/** A low-poly irregular rock/boulder. Deterministic if you pass a seeded rng. */
export function rock(r, o = {}) {
  const g = new THREE.IcosahedronGeometry(r, o.detail ?? 0);
  const pos = g.attributes.position;
  const rand = o.rand || Math.random;
  const jitter = o.jitter ?? 0.28;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    let f = seen.get(key);
    if (f === undefined) { f = 1 + (rand() - 0.5) * jitter * 2; seen.set(key, f); }
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  return finish(g, o);
}

/* ------------------------------------------------------------------ merge */

/**
 * Merge non-indexed-compatible geometries into one. Handles position, normal,
 * color and uv. Everything produced by this module is compatible.
 */
export function merge(geos) {
  const list = geos.filter(Boolean);
  if (!list.length) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];

  // Normalise to non-indexed so we never have to renumber.
  const parts = list.map(g => (g.index ? g.toNonIndexed() : g));

  let total = 0;
  for (const g of parts) total += g.attributes.position.count;

  const hasUv = parts.every(g => g.attributes.uv);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const uv = hasUv ? new Float32Array(total * 2) : null;

  let off = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, u = g.attributes.uv;
    const count = p.count;
    pos.set(p.array.subarray(0, count * 3), off * 3);
    if (n) nor.set(n.array.subarray(0, count * 3), off * 3);
    if (c) col.set(c.array.subarray(0, count * 3), off * 3);
    else col.fill(1, off * 3, (off + count) * 3);
    if (uv && u) uv.set(u.array.subarray(0, count * 2), off * 2);
    off += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  // Free the intermediates — these are throwaway build products.
  for (let i = 0; i < parts.length; i++) if (parts[i] !== list[i]) parts[i].dispose();
  for (const g of list) g.dispose();

  out.computeBoundingSphere();
  return out;
}

/** Merge and wrap in a Mesh with the shared vertex-colour material. */
export function meshOf(geos, material, opts = {}) {
  const g = Array.isArray(geos) ? merge(geos) : geos;
  const m = new THREE.Mesh(g, material);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  if (opts.name) m.name = opts.name;
  return m;
}

/* -------------------------------------------------------------- transforms */

/** Clone a geometry with an extra transform — used for mirrored limbs. */
export function transformed(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 }) {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Mirror across X — a left arm from a right arm. */
export const mirrorX = geo => transformed(geo, { sx: -1 });

/* ------------------------------------------------------------ colour utils */

export function shade(hex, f) {
  _c.set(hex);
  _c.r = Math.min(1, _c.r * f); _c.g = Math.min(1, _c.g * f); _c.b = Math.min(1, _c.b * f);
  return _c.getHex();
}

export function mixColor(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

/** Nudge a colour toward a team tint without losing its identity. */
export function teamTint(hex, teamHex, amount = 0.25) {
  return mixColor(hex, teamHex, amount);
}

/* --------------------------------------------------------------- utilities */

/** A flat quad lying on the ground, for decals and markers. */
export function groundQuad(size, o = {}) {
  return plane(size, size, { ...o, rx: -Math.PI / 2 });
}

/** A simple banner cloth with a wave baked in. */
export function banner(w, h, o = {}) {
  const g = new THREE.PlaneGeometry(w, h, 6, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin((x / w) * 6 + (o.phase || 0)) * 0.07 * (0.4 + (h / 2 - y) / h));
  }
  g.computeVertexNormals();
  return finish(g, o);
}

export { THREE };
