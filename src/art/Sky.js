/* Sky.js — sky dome, lighting rig and weather.

   One `SkyRig` per scene. Switching atmosphere (`apply`) cross-fades sky
   colours, fog, sun angle and ambience, so walking from the courtyard into the
   Library is a lighting change rather than a cut.
*/

import * as THREE from '../../lib/three.module.js';
import { ATMOS, PAL } from './Palette.js';
import { CFG } from '../core/Config.js';
import { rng, TAU, damp, lerp } from '../core/Util.js';

const SKY_VERT = `
varying vec3 vWorld;
void main(){
  vWorld = (modelMatrix * vec4(position,1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`;

const SKY_FRAG = `
uniform vec3 top;
uniform vec3 mid;
uniform vec3 bot;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunPower;
varying vec3 vWorld;
void main(){
  vec3 d = normalize(vWorld);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  // two-stop gradient with a compressed horizon band
  vec3 c = h < 0.5
    ? mix(bot, mid, smoothstep(0.30, 0.52, h))
    : mix(mid, top, smoothstep(0.50, 0.92, h));
  // sun bloom in the sky itself
  float s = max(0.0, dot(d, normalize(sunDir)));
  c += sunColor * pow(s, sunPower) * 0.9;
  c += sunColor * pow(s, 3.0) * 0.06;
  gl_FragColor = vec4(c, 1.0);
}`;

export class SkyRig {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;

    /* --- dome --- */
    this.uniforms = {
      top: { value: new THREE.Color(0x9fc4e0) },
      mid: { value: new THREE.Color(0x5a86b4) },
      bot: { value: new THREE.Color(0x2a3f5c) },
      sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
      sunColor: { value: new THREE.Color(0xfff2d8) },
      sunPower: { value: 220 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    /* --- lights --- */
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    this.sun.castShadow = true;
    const d = CFG.render.shadowDistance;
    this.sun.shadow.camera.left = -d; this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d; this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 260;
    this.sun.shadow.mapSize.set(CFG.render.shadowMapSize, CFG.render.shadowMapSize);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.035;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sun.target = this.sunTarget);

    // hemisphere gives sky-vs-ground bounce for free and stops undersides
    // going pure black, which is what makes flat shading look cheap
    this.hemi = new THREE.HemisphereLight(0x8aa8c8, 0x4a4436, 0.55);
    scene.add(this.hemi);

    // a cold rim light opposite the sun: separates silhouettes from the fog
    this.rim = new THREE.DirectionalLight(0x8ab4e0, 0.34);
    scene.add(this.rim);

    scene.fog = new THREE.Fog(0x7a95b0, CFG.render.fogNear, CFG.render.fogFar);

    this.target = null;   // atmosphere we are fading toward
    this.cur = null;
    this.blend = 1;
    this.clouds = null;
  }

  /** Switch atmosphere. `instant` skips the cross-fade. */
  apply(name, instant = false) {
    const a = ATMOS[name] || ATMOS.keep;
    if (this.curName === name) return;
    this.curName = name;
    this.from = this.cur ? snapshot(this) : null;
    this.target = a;
    this.blend = instant || !this.from ? 1 : 0;
    if (this.blend === 1) this._set(a, 1);
    this.cur = a;
  }

  _set(a, k) {
    const f = this.from;
    const mixC = (uni, to) => {
      if (!f) uni.value.setHex(to);
      else uni.value.lerpColors(_c1.setHex(f[uni._k] ?? to), _c2.setHex(to), k);
    };
    this.uniforms.top._k = 'top'; this.uniforms.mid._k = 'mid'; this.uniforms.bot._k = 'bot';
    mixC(this.uniforms.top, a.sky[0]);
    mixC(this.uniforms.mid, a.sky[1]);
    mixC(this.uniforms.bot, a.sky[2]);

    this.uniforms.sunColor.value.setHex(a.sun);
    this.uniforms.sunPower.value = a.indoor ? 900 : 220;

    const [el, az] = a.sunAngle;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.uniforms.sunDir.value.copy(dir);
    this.sunDir = dir;

    this.sun.color.setHex(a.sun);
    this.sun.intensity = f ? lerp(f.sunI, a.sunI, k) : a.sunI;
    this.hemi.color.setHex(a.sky[1]);
    this.hemi.groundColor.setHex(a.ground);
    this.hemi.intensity = f ? lerp(f.ambI, a.ambI, k) : a.ambI;
    this.rim.color.setHex(a.amb);
    this.rim.position.set(-dir.x * 40, 22, -dir.z * 40);

    const fog = this.scene.fog;
    if (fog) {
      if (f) { _c1.setHex(f.fog); _c2.setHex(a.fog); fog.color.lerpColors(_c1, _c2, k); }
      else fog.color.setHex(a.fog);
      fog.near = f ? lerp(f.fogNear, a.fogNear, k) : a.fogNear;
      fog.far = f ? lerp(f.fogFar, a.fogFar, k) : a.fogFar;
    }
  }

  /** Keep the shadow camera tight around what the player is looking at. */
  follow(x, z) {
    const d = this.sunDir || new THREE.Vector3(0.4, 0.7, 0.3);
    this.sun.position.set(x + d.x * 90, d.y * 90, z + d.z * 90);
    this.sunTarget.position.set(x, 0, z);
    this.sunTarget.updateMatrixWorld();
    this.rim.position.set(x - d.x * 50, 26, z - d.z * 50);
    this.dome.position.set(x, 0, z);
    if (this.clouds) this.clouds.position.set(x, 0, z);
  }

  update(dt, camX = 0, camZ = 0) {
    this.t += dt;
    if (this.blend < 1 && this.target) {
      this.blend = Math.min(1, this.blend + dt / 1.1);
      this._set(this.target, this.blend);
      if (this.blend >= 1) this.from = null;
    }
    this.follow(camX, camZ);
    if (this.clouds) this.clouds.rotation.y += dt * 0.006;
  }

  /** Slow drifting cloud band — cheap, and it stops the sky looking like paint. */
  addClouds(color = 0xffffff, count = 14) {
    if (this.clouds) this.scene.remove(this.clouds);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.13, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, TAU), d = rng.range(90, 240);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(60, 150), rng.range(18, 40)), mat);
      p.position.set(Math.cos(a) * d, rng.range(55, 110), Math.sin(a) * d);
      p.rotation.x = -Math.PI / 2 + rng.range(-0.15, 0.15);
      p.rotation.z = rng.range(0, TAU);
      p.renderOrder = -900;
      g.add(p);
    }
    this.clouds = g;
    this.scene.add(g);
  }

  dispose() {
    this.scene.remove(this.dome, this.sun, this.sunTarget, this.hemi, this.rim);
    if (this.clouds) this.scene.remove(this.clouds);
    this.dome.geometry.dispose(); this.dome.material.dispose();
  }
}

function snapshot(rig) {
  return {
    top: rig.uniforms.top.value.getHex(),
    mid: rig.uniforms.mid.value.getHex(),
    bot: rig.uniforms.bot.value.getHex(),
    fog: rig.scene.fog ? rig.scene.fog.color.getHex() : 0x000000,
    fogNear: rig.scene.fog ? rig.scene.fog.near : 40,
    fogFar: rig.scene.fog ? rig.scene.fog.far : 180,
    sunI: rig.sun.intensity,
    ambI: rig.hemi.intensity,
  };
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/* ==========================================================================
   POINT LIGHT POOL — torches, forge fire, magic
   ========================================================================== */

/**
 * A fixed set of real point lights, assigned each frame to the most important
 * light SOURCES near the player.
 *
 * A zone declares as many sources as it wants — the Library alone has a desk
 * lamp, an orrery, a cauldron, three artefact pedestals, six window bays,
 * eight sconces, three chandeliers and a doorway full of daylight. A forward
 * renderer cannot afford thirty live lights, and it does not need to: the
 * player can only be near a handful at once.
 *
 * So the pool scores every source by `intensity / distance` (with `priority`
 * as a thumb on the scale, for things like a doorway that must ALWAYS be lit)
 * and hands the real lights to the winners. Sources drift in and out smoothly,
 * so nothing visibly pops.
 */
export class LightPool {
  constructor(scene, max = 12) {
    this.scene = scene;
    this.lights = [];
    for (let i = 0; i < max; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 14, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, src: null, phase: rng.range(0, TAU), fade: 0 });
    }
    this.sources = [];
    this._sortT = 0;
  }

  /** Replace every source. Called once per zone load. */
  setSources(list) {
    this.sources = (list || []).map(s => ({
      x: s.x, y: s.y, z: s.z, color: s.color,
      intensity: s.intensity, dist: s.dist, flicker: s.flicker || 0,
      priority: s.priority ?? 1,
    }));
    this._assign(0, 0);
  }

  /** Back-compatible single add. */
  claim(x, y, z, color, intensity, dist, flicker = 0, priority = 1) {
    const s = { x, y, z, color, intensity, dist, flicker, priority };
    this.sources.push(s);
    return s;
  }

  releaseAll() {
    this.sources.length = 0;
    for (const h of this.lights) { h.src = null; h.fade = 0; h.light.visible = false; h.light.intensity = 0; }
  }

  _assign(px, pz) {
    if (!this.sources.length) {
      for (const h of this.lights) { h.src = null; }
      return;
    }
    // score: bright things and near things win; priority lets a zone pin one
    for (const s of this.sources) {
      const d = Math.hypot(s.x - px, s.z - pz);
      s._score = (s.intensity * s.priority) / (1 + d * 0.16);
    }
    const ranked = this.sources.slice().sort((a, b) => b._score - a._score);
    const want = ranked.slice(0, this.lights.length);

    // keep a light on the source it already has, so nothing swaps needlessly
    const taken = new Set();
    for (const h of this.lights) {
      if (h.src && want.includes(h.src)) taken.add(h.src);
      else h.src = null;
    }
    const free = want.filter(s => !taken.has(s));
    for (const h of this.lights) {
      if (h.src) continue;
      h.src = free.shift() || null;
    }
  }

  update(dt, t, px = 0, pz = 0) {
    // re-rank a few times a second; every frame is wasted work and can thrash
    this._sortT -= dt;
    if (this._sortT <= 0) { this._sortT = 0.35; this._assign(px, pz); }

    for (const h of this.lights) {
      const s = h.src;
      // fade in and out rather than popping when the assignment changes
      h.fade = Math.max(0, Math.min(1, h.fade + (s ? dt * 3.2 : -dt * 3.2)));
      if (!s && h.fade <= 0) { h.light.visible = false; h.light.intensity = 0; continue; }
      if (!s) { h.light.intensity = 0; continue; }

      h.light.visible = true;
      h.light.position.set(s.x, s.y, s.z);
      h.light.color.setHex(s.color);
      h.light.distance = s.dist;
      let k = 1;
      if (s.flicker) {
        const f = Math.sin(t * 9 + h.phase) * 0.5 + Math.sin(t * 23.3 + h.phase * 2) * 0.3 + Math.sin(t * 3.1) * 0.2;
        k = 1 + f * s.flicker;
      }
      h.light.intensity = s.intensity * k * h.fade;
    }
  }

  dispose() { for (const h of this.lights) this.scene.remove(h.light); this.lights.length = 0; }
}
