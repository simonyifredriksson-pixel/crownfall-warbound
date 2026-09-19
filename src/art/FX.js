/* FX.js — every visual effect in the game, pooled.

   Four pools, all pre-allocated, none of which ever allocate during a battle:

     PARTICLES  one THREE.Points with a 6000-slot ring buffer and a custom
                shader (soft round sprite, additive, size-attenuated)
     RINGS      expanding flat rings — shockwaves, novas, telegraphs
     BEAMS      stretched quads between two points — lightning, heal links
     DECALS     ground quads that linger — fire, oil, craters, blood

   The rule for readability: an effect may be bright, but it may never hide a
   unit. Ground effects stay flat and dark-edged; bursts are short and leave
   the silhouette visible.
*/

import * as THREE from '../../lib/three.module.js';
import { ring, plane, sphere, box, merge } from './Geo.js';
import { PAL, MATS } from './Palette.js';
import { rng, TAU, clamp01 } from '../core/Util.js';

const MAX_PARTICLES = 6000;
const MAX_RINGS = 96;
const MAX_BEAMS = 64;
const MAX_DECALS = 160;

/* --------------------------------------------------------- particle shader */

const PARTICLE_VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  // soft core with a brighter centre — reads as light, not as a sticker
  float f = 1.0 - smoothstep(0.02, 0.25, r);
  float core = 1.0 - smoothstep(0.0, 0.06, r);
  gl_FragColor = vec4(vColor * (1.0 + core * 0.9), vAlpha * f);
}`;

/* ========================================================================== */

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    this._initParticles();
    this._initRings();
    this._initBeams();
    this._initDecals();
    this.quality = 1;      // scaled down on weak devices
  }

  /* ------------------------------------------------------------ particles */

  _initParticles() {
    const n = MAX_PARTICLES;
    this.pCount = n;
    this.pHead = 0;
    this.pPos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3);
    this.pSize = new Float32Array(n);
    this.pAlpha = new Float32Array(n);
    this.pLife = new Float32Array(n);
    this.pMax = new Float32Array(n);
    this.pGrav = new Float32Array(n);
    this.pDrag = new Float32Array(n);
    this.pShrink = new Float32Array(n);

    // park everything far below the world so unused slots draw nothing
    for (let i = 0; i < n; i++) this.pPos[i * 3 + 1] = -9999;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const m = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);
    this.pGeo = g;
  }

  /**
   * Emit one particle.
   * @param o {x,y,z, vx,vy,vz, color, size, life, grav, drag, shrink, alpha}
   */
  particle(o) {
    const i = this.pHead;
    this.pHead = (this.pHead + 1) % this.pCount;
    const i3 = i * 3;
    this.pPos[i3] = o.x; this.pPos[i3 + 1] = o.y; this.pPos[i3 + 2] = o.z;
    this.pVel[i3] = o.vx || 0; this.pVel[i3 + 1] = o.vy || 0; this.pVel[i3 + 2] = o.vz || 0;
    const c = _col.set(o.color === undefined ? 0xffffff : o.color);
    this.pCol[i3] = c.r; this.pCol[i3 + 1] = c.g; this.pCol[i3 + 2] = c.b;
    this.pSize[i] = o.size ?? 0.2;
    this.pAlpha[i] = o.alpha ?? 1;
    this.pLife[i] = 0;
    this.pMax[i] = o.life ?? 0.7;
    this.pGrav[i] = o.grav ?? 0;
    this.pDrag[i] = o.drag ?? 1.6;
    this.pShrink[i] = o.shrink ?? 1;
    return i;
  }

  /** A burst of `n` particles in a cone/sphere. */
  burst(n, o) {
    n = Math.max(1, Math.round(n * this.quality));
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, TAU);
      const el = o.cone ? rng.range(0, o.cone) : Math.acos(rng.range(-1, 1));
      const sp = rng.range(o.speed * 0.4, o.speed);
      const dirY = o.up ? Math.cos(el) : Math.cos(el);
      const s = Math.sin(el);
      this.particle({
        x: o.x + rng.range(-1, 1) * (o.spread || 0),
        y: o.y + rng.range(-1, 1) * (o.spread || 0) * 0.4,
        z: o.z + rng.range(-1, 1) * (o.spread || 0),
        vx: Math.cos(a) * s * sp + (o.vx || 0),
        vy: (o.up ? Math.abs(dirY) : dirY) * sp + (o.vy || 0),
        vz: Math.sin(a) * s * sp + (o.vz || 0),
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        size: rng.range(o.size * 0.6, o.size * 1.3),
        life: rng.range(o.life * 0.7, o.life * 1.2),
        grav: o.grav, drag: o.drag, shrink: o.shrink, alpha: o.alpha,
      });
    }
  }

  /* --------------------------------------------------------------- rings */

  _initRings() {
    this.rings = [];
    const geo = ring(0.9, 1.0, 40, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 });
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.visible = false; m.renderOrder = 8; m.frustumCulled = false;
      this.scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 0, r0: 1, r1: 4, fade: 1, spin: 0, flat: true });
    }
    this.ringHead = 0;
  }

  /** An expanding ring. `flat` lies on the ground; otherwise it faces up. */
  ringFx(o) {
    const r = this.rings[this.ringHead];
    this.ringHead = (this.ringHead + 1) % this.rings.length;
    r.t = 0; r.dur = o.life ?? 0.5;
    r.r0 = o.r0 ?? 0.3; r.r1 = o.r1 ?? 3;
    r.fade = o.fade ?? 1; r.spin = o.spin ?? 0;
    r.mesh.position.set(o.x, o.y ?? 0.08, o.z);
    r.mesh.rotation.set(o.vertical ? 0 : -Math.PI / 2, 0, 0);
    if (o.vertical) { r.mesh.rotation.x = 0; r.mesh.lookAt(o.lookX ?? o.x, o.y ?? 0, (o.lookZ ?? o.z) + 1); }
    r.mesh.material.color.set(o.color ?? 0xffffff);
    r.mesh.material.opacity = o.alpha ?? 0.9;
    r.startAlpha = o.alpha ?? 0.9;
    r.mesh.visible = true;
    r.mesh.scale.setScalar(r.r0);
    return r;
  }

  /* --------------------------------------------------------------- beams */

  _initBeams() {
    this.beams = [];
    const geo = plane(1, 1, { color: 0xffffff, grad: 0 });
    for (let i = 0; i < MAX_BEAMS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.visible = false; m.renderOrder = 9; m.frustumCulled = false;
      this.scene.add(m);
      this.beams.push({ mesh: m, t: 0, dur: 0 });
    }
    this.beamHead = 0;
  }

  /** A stretched quad from a to b (both {x,y,z}). */
  beamFx(ax, ay, az, bx, by, bz, o = {}) {
    const b = this.beams[this.beamHead];
    this.beamHead = (this.beamHead + 1) % this.beams.length;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 0.01;
    b.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    b.mesh.scale.set(o.width ?? 0.14, len, 1);
    _v1.set(dx, dy, dz).normalize();
    b.mesh.quaternion.setFromUnitVectors(_up, _v1);
    b.mesh.material.color.set(o.color ?? 0xffffff);
    b.mesh.material.opacity = o.alpha ?? 0.95;
    b.startAlpha = o.alpha ?? 0.95;
    b.mesh.visible = true;
    b.t = 0; b.dur = o.life ?? 0.2;
    b.billboard = o.billboard !== false;
    return b;
  }

  /* -------------------------------------------------------------- decals */

  _initDecals() {
    this.decals = [];
    const geo = plane(1, 1, { color: 0xffffff, rx: -Math.PI / 2, grad: 0 });
    for (let i = 0; i < MAX_DECALS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false;
      this.scene.add(m);
      this.decals.push({ mesh: m, t: 0, dur: 0, fadeIn: 0 });
    }
    this.decalHead = 0;
  }

  decal(o) {
    const d = this.decals[this.decalHead];
    this.decalHead = (this.decalHead + 1) % this.decals.length;
    d.mesh.position.set(o.x, o.y ?? 0.035, o.z);
    d.mesh.rotation.set(-Math.PI / 2, 0, o.rot ?? rng.range(0, TAU));
    d.mesh.scale.setScalar(o.r ?? 2);
    d.mesh.material.color.set(o.color ?? 0x000000);
    d.mesh.material.opacity = o.alpha ?? 0.4;
    d.mesh.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    d.startAlpha = o.alpha ?? 0.4;
    d.mesh.visible = true;
    d.t = 0; d.dur = o.life ?? 8;
    d.pulse = o.pulse || 0;
    return d;
  }

  /* ========================================================================
     NAMED EFFECTS
     ======================================================================== */

  play(name, x, y, z, o = {}) {
    const sc = o.scale ?? 1;
    switch (name) {

      /* --- melee ------------------------------------------------------- */
      case 'impact':
        this.burst(7 * sc, { x, y, z, speed: 4.5 * sc, size: 0.14 * sc, life: 0.3, color: [0xffe9a8, 0xffffff], grav: -7, spread: 0.12 });
        this.ringFx({ x, y: y, z, r0: 0.2, r1: 0.9 * sc, life: 0.2, color: 0xffe9a8, alpha: 0.6 });
        break;
      case 'bloodHit':
        this.burst(9 * sc, { x, y, z, speed: 4, size: 0.11 * sc, life: 0.42, color: [0xc5362b, 0x8e2018], grav: -12, spread: 0.14 });
        break;
      case 'sparks':
        this.burst(10 * sc, { x, y, z, speed: 6, size: 0.075, life: 0.34, color: [0xffe9a8, 0xffd479, 0xffffff], grav: -16, spread: 0.1 });
        break;
      case 'parry':
        this.burst(14, { x, y, z, speed: 7, size: 0.09, life: 0.3, color: [0xffffff, 0xffe9a8], grav: -8 });
        this.ringFx({ x, y, z, r0: 0.1, r1: 1.2, life: 0.22, color: 0xffffff, alpha: 0.85, vertical: true });
        break;
      case 'block':
        this.ringFx({ x, y, z, r0: 0.3, r1: 1.1, life: 0.28, color: 0x9fd0ff, alpha: 0.7 });
        this.burst(6, { x, y, z, speed: 3, size: 0.1, life: 0.26, color: 0x9fd0ff });
        break;

      /* --- ground & shock ---------------------------------------------- */
      case 'shockwave':
        this.ringFx({ x, y: 0.1, z, r0: 0.4, r1: sc, life: 0.55, color: o.color ?? 0xffe0b0, alpha: 0.85 });
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: sc * 0.7, life: 0.4, color: 0xffffff, alpha: 0.5 });
        this.burst(20 * Math.min(2, sc / 3), { x, y: 0.15, z, speed: 5 * (sc / 4), size: 0.18, life: 0.6, color: [0xc8a98a, 0x8a7a63], grav: -9, up: true, spread: sc * 0.3 });
        this.decal({ x, z, r: sc * 1.4, color: 0x3a2f24, alpha: 0.3, life: 5 });
        break;
      case 'crater':
        this.ringFx({ x, y: 0.1, z, r0: 0.5, r1: sc, life: 0.8, color: 0xc8a98a, alpha: 0.9 });
        this.burst(40, { x, y: 0.2, z, speed: 8, size: 0.24, life: 0.9, color: [0x8a7a63, 0x5a4a3a, 0xc8a98a], grav: -12, up: true, spread: sc * 0.4 });
        this.decal({ x, z, r: sc * 1.5, color: 0x2a2018, alpha: 0.55, life: 20 });
        break;
      case 'dust':
        this.burst(6, { x, y: 0.08, z, speed: 1.2, size: 0.16, life: 0.55, color: 0x9a8a72, grav: 0.4, alpha: 0.4, drag: 2.4 });
        break;

      /* --- arcane ------------------------------------------------------ */
      case 'arcaneNova':
        this.ringFx({ x, y: 0.1, z, r0: 0.3, r1: sc, life: 0.5, color: 0x9a6fe0, alpha: 0.95 });
        this.ringFx({ x, y: 0.6, z, r0: 0.2, r1: sc * 0.8, life: 0.4, color: 0xd0b0ff, alpha: 0.6 });
        this.burst(34, { x, y: 0.7, z, speed: 6 * (sc / 4), size: 0.17, life: 0.6, color: [0x9a6fe0, 0xd0b0ff, 0xffffff], grav: -2, spread: sc * 0.25 });
        break;
      case 'castRing':
        this.ringFx({ x, y: 0.08, z, r0: 0.2, r1: 1.4, life: 0.5, color: o.color ?? 0x9a6fe0, alpha: 0.7 });
        this.burst(8, { x, y: 0.5, z, speed: 1.4, size: 0.1, life: 0.6, color: o.color ?? 0x9a6fe0, grav: 1.8 });
        break;
      case 'arcaneTrail':
        this.particle({ x, y, z, vx: rng.range(-.4, .4), vy: rng.range(0, .6), vz: rng.range(-.4, .4), color: o.color ?? 0x9a6fe0, size: 0.13, life: 0.35, drag: 3 });
        break;
      case 'voidBlink':
        this.ringFx({ x, y, z, r0: 0.1, r1: 1.6, life: 0.35, color: 0xb07fd0, alpha: 0.9, vertical: true });
        this.burst(16, { x, y, z, speed: 4, size: 0.14, life: 0.4, color: [0xb07fd0, 0x2a1a4a] });
        break;
      case 'voidRift':
        this.ringFx({ x, y: 0.2, z, r0: 0.2, r1: sc, life: o.life ?? 3, color: 0x7a4fa0, alpha: 0.5, spin: 1.5 });
        this.decal({ x, z, r: sc, color: 0x2a1a4a, alpha: 0.6, life: o.life ?? 3, pulse: 3 });
        for (let i = 0; i < 26; i++) {
          const a = rng.range(0, TAU), d = rng.range(sc * 0.4, sc);
          this.particle({ x: x + Math.cos(a) * d, y: 0.2, z: z + Math.sin(a) * d, vx: -Math.cos(a) * 3, vy: 1.4, vz: -Math.sin(a) * 3, color: 0xb07fd0, size: 0.14, life: 0.9, drag: 0.6 });
        }
        break;

      /* --- fire -------------------------------------------------------- */
      case 'ember':
        this.burst(4, { x, y, z, speed: 1.6, size: 0.1, life: 0.5, color: [0xe8823a, 0xffd479], grav: 2.4, up: true });
        break;
      case 'explosion':
        this.ringFx({ x, y: 0.15, z, r0: 0.3, r1: sc, life: 0.45, color: 0xffb06a, alpha: 0.95 });
        this.burst(30, { x, y: y || 0.6, z, speed: 7 * (sc / 4), size: 0.24, life: 0.55, color: [0xffd479, 0xe8823a, 0xc5362b], grav: 2.2, spread: sc * 0.2 });
        this.burst(14, { x, y: y || 0.6, z, speed: 3, size: 0.4, life: 0.9, color: [0x3a3028, 0x5a5048], grav: 1.2, alpha: 0.5, drag: 1.1 });
        this.decal({ x, z, r: sc * 1.2, color: 0x241a14, alpha: 0.45, life: 12 });
        break;
      case 'firestorm':
        this.decal({ x, z, r: sc * 2, color: 0xe8823a, alpha: 0.32, life: o.life ?? 4, additive: true, pulse: 4 });
        for (let i = 0; i < 12; i++) {
          const a = rng.range(0, TAU), d = Math.sqrt(rng.range(0, 1)) * sc;
          this.particle({ x: x + Math.cos(a) * d, y: 0.1, z: z + Math.sin(a) * d, vy: rng.range(1.6, 3.4), color: rng.chance(0.5) ? 0xe8823a : 0xffd479, size: rng.range(0.16, 0.3), life: rng.range(0.5, 1.0), grav: 2.0, drag: 1.0 });
        }
        break;
      case 'meteor': {
        // the incoming rock, drawn as a fast streak of particles
        for (let i = 0; i < 26; i++) {
          const t = i / 26;
          this.particle({ x: x + t * 5, y: 14 - t * 13.5, z: z - t * 5, vx: -4, vy: -12, vz: 4, color: i % 3 ? 0xe8823a : 0xffd479, size: 0.5 - t * 0.2, life: 0.35, drag: 0.4 });
        }
        this.ringFx({ x, y: 0.15, z, r0: 0.5, r1: sc * 1.3, life: 0.7, color: 0xffb06a, alpha: 1 });
        this.ringFx({ x, y: 0.4, z, r0: 0.3, r1: sc, life: 0.5, color: 0xffffff, alpha: 0.7 });
        this.burst(60, { x, y: 0.4, z, speed: 12, size: 0.3, life: 0.9, color: [0xffd479, 0xe8823a, 0xc5362b, 0x5a4a3a], grav: 0, up: true, spread: sc * 0.3 });
        this.decal({ x, z, r: sc * 1.6, color: 0x1a1210, alpha: 0.65, life: 30 });
        break;
      }
      case 'phoenixBurst':
        this.ringFx({ x, y: 0.2, z, r0: 0.4, r1: sc, life: 0.7, color: 0xffd479, alpha: 1 });
        this.burst(50, { x, y: y || 1.2, z, speed: 9, size: 0.26, life: 0.9, color: [0xffd479, 0xff8a3a, 0xffffff], grav: 1.4, spread: 0.3 });
        break;

      /* --- frost ------------------------------------------------------- */
      case 'freeze':
        this.burst(18, { x, y, z, speed: 3.6, size: 0.14, life: 0.55, color: [0xa8e6f0, 0xffffff, 0x79cfe0], grav: -4 });
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: 1.2, life: 0.4, color: 0xa8e6f0, alpha: 0.8 });
        break;
      case 'blizzard':
        this.decal({ x, z, r: sc * 2, color: 0x79cfe0, alpha: 0.25, life: o.life ?? 5, additive: true, pulse: 2 });
        for (let i = 0; i < 10; i++) {
          const a = rng.range(0, TAU), d = Math.sqrt(rng.range(0, 1)) * sc;
          this.particle({ x: x + Math.cos(a) * d, y: rng.range(1.5, 3.5), z: z + Math.sin(a) * d, vx: rng.range(-1, 1), vy: -2.4, vz: rng.range(-1, 1), color: 0xd8f4ff, size: rng.range(0.08, 0.16), life: 1.2, drag: 0.2 });
        }
        break;

      /* --- nature & poison --------------------------------------------- */
      case 'vines':
        this.ringFx({ x, y: 0.08, z, r0: 0.3, r1: sc, life: 0.5, color: 0x5fa25a, alpha: 0.8 });
        this.decal({ x, z, r: sc * 1.4, color: 0x2f4a2a, alpha: 0.45, life: 3 });
        for (let i = 0; i < 14; i++) {
          const a = rng.range(0, TAU), d = rng.range(0, sc);
          this.particle({ x: x + Math.cos(a) * d, y: 0.05, z: z + Math.sin(a) * d, vy: rng.range(2, 4.5), color: 0x5fa25a, size: 0.14, life: 0.5, grav: -6 });
        }
        break;
      case 'poisonBurst':
        this.burst(22, { x, y, z, speed: 4, size: 0.18, life: 0.7, color: [0x8fbf4a, 0x4a7a2a], grav: 0.6, drag: 1.2 });
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: sc, life: 0.5, color: 0x8fbf4a, alpha: 0.7 });
        break;
      case 'oilSplash':
        this.decal({ x, z, r: sc * 1.6, color: 0x14100a, alpha: 0.6, life: 9 });
        this.burst(16, { x, y: 0.2, z, speed: 3.4, size: 0.16, life: 0.5, color: [0x2a2418, 0x4a3f2a], grav: -8 });
        break;

      /* --- holy & heal -------------------------------------------------- */
      case 'healBurst':
        this.burst(14 * sc, { x, y, z, speed: 1.8, size: 0.14, life: 0.8, color: [0x8fe09a, 0xd8f4c8], grav: 2.4, up: true, spread: 0.2 });
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: 0.9 * sc, life: 0.5, color: 0x8fe09a, alpha: 0.6 });
        break;
      case 'holyBurst':
        this.ringFx({ x, y: 0.1, z, r0: 0.3, r1: sc || 2.5, life: 0.6, color: 0xf3d98a, alpha: 0.9 });
        this.burst(26, { x, y: y || 1.2, z, speed: 4, size: 0.16, life: 0.8, color: [0xf3d98a, 0xffffff], grav: 2.0, up: true });
        break;
      case 'holyPillar':
        for (let i = 0; i < 40; i++)
          this.particle({ x: x + rng.range(-1, 1) * sc * 0.4, y: rng.range(0, 6), z: z + rng.range(-1, 1) * sc * 0.4, vy: rng.range(3, 7), color: 0xf3d98a, size: 0.2, life: 0.9, drag: 0.5 });
        this.ringFx({ x, y: 0.1, z, r0: 0.4, r1: sc * 1.4, life: 0.8, color: 0xffe9a8, alpha: 1 });
        break;
      case 'goldArc': {
        const a = o.angle || 0, len = o.len || 8;
        for (let i = 0; i < 30; i++) {
          const t = (i / 30 - 0.5) * 1.2;
          const aa = a + t;
          this.particle({ x: x + Math.cos(aa) * len * 0.5, y: y, z: z + Math.sin(aa) * len * 0.5, vx: Math.cos(aa) * 7, vy: 0.4, vz: Math.sin(aa) * 7, color: i % 2 ? 0xffd479 : 0xffe9a8, size: 0.24, life: 0.4, drag: 2.5 });
        }
        break;
      }
      case 'rallyRing':
        this.ringFx({ x, y: 0.1, z, r0: 0.4, r1: sc, life: 0.9, color: o.color ?? 0xd9a441, alpha: 0.8 });
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: sc * 0.75, life: 0.7, color: 0xffe9a8, alpha: 0.5 });
        break;
      case 'tauntRing':
        this.ringFx({ x, y: 0.1, z, r0: 0.3, r1: sc, life: 0.6, color: 0xe08b7f, alpha: 0.8 });
        break;
      case 'silenceRing':
        this.ringFx({ x, y: 0.5, z, r0: 0.3, r1: sc, life: 0.7, color: 0x9a6fe0, alpha: 0.75 });
        this.decal({ x, z, r: sc * 1.4, color: 0x3a2a4a, alpha: 0.35, life: 4 });
        break;
      case 'bastionDome':
        this.ringFx({ x, y: 0.12, z, r0: 0.5, r1: sc, life: 0.8, color: 0xffd479, alpha: 0.9 });
        this.decal({ x, z, r: sc * 1.1, color: 0xd9a441, alpha: 0.22, life: o.life ?? 6, additive: true, pulse: 2 });
        break;
      case 'shieldFlare':
        this.ringFx({ x, y, z, r0: 0.3, r1: sc || 2, life: 0.4, color: o.color ?? 0x7fb6e8, alpha: 0.8, vertical: false });
        this.burst(10, { x, y, z, speed: 2.4, size: 0.12, life: 0.4, color: o.color ?? 0x7fb6e8 });
        break;

      /* --- dark --------------------------------------------------------- */
      case 'necroBurst':
        this.burst(20 * sc, { x, y, z, speed: 3.4, size: 0.16, life: 0.8, color: [0x7a4fa0, 0x2a2438, 0x9a6fe0], grav: 1.4, up: true });
        this.ringFx({ x, y: 0.08, z, r0: 0.2, r1: 1.4 * sc, life: 0.6, color: 0x7a4fa0, alpha: 0.7 });
        break;
      case 'curse':
        this.burst(12, { x, y, z, speed: 2.2, size: 0.14, life: 0.9, color: [0x7a4fa0, 0x3a2a4a], grav: 1.0 });
        break;
      case 'dominate':
        this.ringFx({ x, y: 0.1, z, r0: 0.2, r1: 2.2, life: 0.7, color: 0xb07fd0, alpha: 0.9 });
        this.burst(24, { x, y, z, speed: 4, size: 0.18, life: 0.8, color: [0xb07fd0, 0xffffff], grav: 2.0, up: true });
        break;
      case 'smoke':
        this.burst(14 * sc, { x, y, z, speed: 2.4, size: 0.3, life: 0.7, color: [0x2a2a35, 0x4a4a58], grav: 1.2, alpha: 0.55, drag: 1.1 });
        break;
      case 'rage':
        this.burst(16, { x, y, z, speed: 2.6, size: 0.16, life: 0.6, color: [0xc5362b, 0xe8823a], grav: 2.4, up: true });
        this.ringFx({ x, y: 0.1, z, r0: 0.3, r1: sc || 2, life: 0.5, color: 0xc5362b, alpha: 0.7 });
        break;

      /* --- ranged ------------------------------------------------------- */
      case 'arrowRain':
        for (let i = 0; i < 14; i++) {
          const a = rng.range(0, TAU), d = Math.sqrt(rng.range(0, 1)) * sc;
          this.particle({ x: x + Math.cos(a) * d, y: 5, z: z + Math.sin(a) * d, vy: -18, color: 0xd8cbb0, size: 0.16, life: 0.32, drag: 0.1 });
        }
        this.ringFx({ x, y: 0.08, z, r0: sc * 0.6, r1: sc, life: 0.35, color: 0xd9a441, alpha: 0.6 });
        break;
      case 'pin':
        this.burst(6, { x, y, z, speed: 2.4, size: 0.1, life: 0.35, color: 0xd8cbb0, grav: -8 });
        break;
      case 'breathCone': {
        const a = o.angle || 0, len = o.len || 10;
        for (let i = 0; i < 16; i++) {
          const spread = rng.range(-0.35, 0.35);
          const sp = rng.range(len * 0.6, len);
          this.particle({
            x, y, z, vx: Math.cos(a + spread) * sp, vy: rng.range(-0.6, 0.6), vz: Math.sin(a + spread) * sp,
            color: o.color ?? 0x8fbf4a, size: rng.range(0.22, 0.42), life: 0.55, drag: 1.8, alpha: 0.8,
          });
        }
        break;
      }
      case 'whirl':
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU;
          this.particle({ x: x + Math.cos(a) * sc, y, z: z + Math.sin(a) * sc, vx: -Math.sin(a) * 6, vy: 0, vz: Math.cos(a) * 6, color: 0xe4e8ef, size: 0.16, life: 0.28, drag: 3 });
        }
        break;
      case 'horn':
        this.burst(12, { x, y, z, speed: 3, size: 0.18, life: 0.7, color: 0xd9a441, grav: 1.6, up: true });
        break;

      /* --- deployment & structure --------------------------------------- */
      case 'deploySpawn':
        this.ringFx({ x, y: 0.09, z, r0: 0.2, r1: 1.6, life: 0.55, color: o.color ?? PAL.teamPlayerGlow, alpha: 0.9 });
        this.burst(18, { x, y: 0.1, z, speed: 3, size: 0.16, life: 0.6, color: o.color ?? PAL.teamPlayerGlow, grav: 2.6, up: true, spread: 0.4 });
        break;
      case 'structureHit':
        this.burst(12, { x, y, z, speed: 4, size: 0.18, life: 0.5, color: [0x8a8a7a, 0xc8c0a8], grav: -12, spread: 0.3 });
        break;
      case 'structureFall':
        this.burst(70, { x, y: y || 2, z, speed: 8, size: 0.34, life: 1.6, color: [0x8a8a7a, 0x5a5a4a, 0xc8c0a8], grav: -9, spread: 2 });
        this.burst(30, { x, y: y || 2, z, speed: 3, size: 0.6, life: 2.2, color: [0x3a3a35, 0x5a5a52], grav: 0.6, alpha: 0.45, drag: 0.9, spread: 2 });
        this.ringFx({ x, y: 0.12, z, r0: 0.5, r1: 7, life: 1.0, color: 0xc8c0a8, alpha: 0.8 });
        this.decal({ x, z, r: 6, color: 0x2a2620, alpha: 0.5, life: 60 });
        break;
      case 'capture':
        this.ringFx({ x, y: 0.1, z, r0: 1, r1: 6.5, life: 0.9, color: o.color ?? 0x5fbaf0, alpha: 0.8 });
        this.burst(24, { x, y: 0.2, z, speed: 3, size: 0.18, life: 1.0, color: o.color ?? 0x5fbaf0, grav: 2.4, up: true, spread: 2 });
        break;
      case 'levelUp':
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * TAU;
          this.particle({ x: x + Math.cos(a) * 0.8, y: 0.1, z: z + Math.sin(a) * 0.8, vy: rng.range(4, 8), vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, color: i % 2 ? 0xffd479 : 0xffe9a8, size: 0.2, life: 1.1, drag: 0.6 });
        }
        this.ringFx({ x, y: 0.1, z, r0: 0.3, r1: 3, life: 0.9, color: 0xffd479, alpha: 0.9 });
        break;
    }
  }

  /** A telegraph circle that fills before an attack lands. */
  telegraph(x, z, r, dur, color, o = {}) {
    const d = this.decal({ x, z, r, color: color ?? 0xe8823a, alpha: o.danger ? 0.34 : 0.22, life: dur, additive: true });
    d.telegraph = true;
    const rg = this.ringFx({ x, y: 0.07, z, r0: r, r1: r, life: dur, color: color ?? 0xe8823a, alpha: 0.75 });
    rg.hold = true;
    return d;
  }

  /* ------------------------------------------------------------- update */

  update(dt) {
    this.t += dt;
    const n = this.pCount;
    const pos = this.pPos, vel = this.pVel, life = this.pLife, max = this.pMax;
    const alpha = this.pAlpha, size = this.pSize;

    for (let i = 0; i < n; i++) {
      if (life[i] >= max[i]) { if (alpha[i] !== 0) { alpha[i] = 0; pos[i * 3 + 1] = -9999; } continue; }
      life[i] += dt;
      const i3 = i * 3;
      const drag = Math.max(0, 1 - this.pDrag[i] * dt);
      vel[i3] *= drag; vel[i3 + 2] *= drag;
      vel[i3 + 1] = vel[i3 + 1] * drag + this.pGrav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = life[i] / max[i];
      alpha[i] = (1 - t) * (1 - t);
      if (this.pShrink[i] !== 1) size[i] *= Math.max(0.2, 1 - (1 - this.pShrink[i]) * dt * 4);
    }

    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.alpha.needsUpdate = true;
    this.pGeo.attributes.size.needsUpdate = true;
    this.pGeo.attributes.pcolor.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) { r.mesh.visible = false; continue; }
      const s = r.hold ? r.r1 : r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = r.startAlpha * (1 - t) ** (r.fade);
      if (r.spin) r.mesh.rotation.z += r.spin * dt;
    }

    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const t = b.t / b.dur;
      if (t >= 1) { b.mesh.visible = false; continue; }
      b.mesh.material.opacity = b.startAlpha * (1 - t);
    }

    for (const d of this.decals) {
      if (!d.mesh.visible) continue;
      d.t += dt;
      const t = d.t / d.dur;
      if (t >= 1) { d.mesh.visible = false; continue; }
      let a = d.startAlpha;
      if (d.telegraph) a = d.startAlpha * (0.4 + 0.6 * t);        // fills up as it nears
      else if (t > 0.7) a = d.startAlpha * (1 - (t - 0.7) / 0.3);
      if (d.pulse) a *= 0.75 + 0.25 * Math.sin(this.t * d.pulse);
      d.mesh.material.opacity = a;
    }
  }

  /** Billboard the beams toward the camera so they never go edge-on. */
  faceCamera(camera) {
    for (const b of this.beams) {
      if (!b.mesh.visible || !b.billboard) continue;
      b.mesh.getWorldPosition(_v2);
      _v1.copy(camera.position).sub(_v2).normalize();
      // keep the beam's length axis, rotate around it to face the camera
      b.mesh.up.copy(_v1);
    }
  }

  clear() {
    for (let i = 0; i < this.pCount; i++) { this.pLife[i] = this.pMax[i]; this.pAlpha[i] = 0; this.pPos[i * 3 + 1] = -9999; }
    for (const r of this.rings) r.mesh.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
    for (const d of this.decals) d.mesh.visible = false;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.points);
    this.pGeo.dispose(); this.points.material.dispose();
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const b of this.beams) { this.scene.remove(b.mesh); b.mesh.material.dispose(); }
    for (const d of this.decals) { this.scene.remove(d.mesh); d.mesh.material.dispose(); }
  }
}

const _col = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
