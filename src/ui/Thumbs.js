/* Thumbs.js — card art.

   Every card shows the unit's ACTUAL 3D model, rendered once at the right
   visual tier and cached as a bitmap. That is what makes a level-1 Knight and
   a level-12 Knight visibly the same character with twelve levels of kit on
   him — the card art is the game model, not a separate illustration.

   One small offscreen WebGL context does all of it. Cache key is
   `unitId:tier`, so upgrading a card genuinely changes its picture.
*/

import * as THREE from '../../lib/three.module.js';
import { buildUnitModel, buildPortraitModel } from '../art/UnitArt.js';
import { buildCommanderPortrait } from '../art/CommanderArt.js';
import { UNITS } from '../data/Units.js';
import { RARITY_HEX } from '../art/Palette.js';
import { tierOf } from '../data/Units.js';

const W = 220, H = 290;

class ThumbFactory {
  constructor() {
    this.cache = new Map();
    this.ready = false;
  }

  _init() {
    if (this.ready) return true;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W; this.canvas.height = H;
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
      });
      this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      this.renderer.setSize(W, H, false);
      this.renderer.shadowMap.enabled = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

      // three-point light rig: key, fill, and a strong rim that separates the
      // silhouette from the card's dark background
      const key = new THREE.DirectionalLight(0xfff0dc, 1.5);
      key.position.set(3, 5, 4);
      const fill = new THREE.DirectionalLight(0x8aa8c8, 0.55);
      fill.position.set(-4, 2, 2);
      const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2);
      rim.position.set(-2, 3, -5);
      const amb = new THREE.HemisphereLight(0x9ab4d0, 0x40382c, 0.7);
      this.scene.add(key, fill, rim, amb);

      this.holder = new THREE.Group();
      this.scene.add(this.holder);
      this.ready = true;
      return true;
    } catch (e) {
      console.warn('[thumbs] no WebGL context for portraits', e);
      this.ready = false;
      this.failed = true;
      return false;
    }
  }

  /**
   * Returns a <canvas> containing the portrait, or null if WebGL is
   * unavailable (callers fall back to an emoji glyph).
   */
  get(unitId, level = 1) {
    const unit = UNITS[unitId];
    if (!unit) return null;
    const tier = tierOf(level);
    const key = unitId + ':' + tier;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed || !this._init()) return null;

    const rig = buildPortraitModel(unit, tier * 3 + 1);
    this.holder.clear();
    this.holder.add(rig.root);

    // frame the model: fit its height into the viewport with a little headroom
    const h = rig.height || 1.8;
    const dist = (h * 1.32) / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    this.camera.position.set(dist * 0.42, h * 0.62, dist * 0.92);
    this.camera.lookAt(0, h * 0.48, 0);
    rig.root.rotation.y = -0.5;

    // a soft rarity-tinted backdrop disc so the card art has depth
    const rarity = RARITY_HEX[unit.rarity] || 0x555555;
    const bg = new THREE.Mesh(
      new THREE.CircleGeometry(h * 0.85, 28),
      new THREE.MeshBasicMaterial({ color: rarity, transparent: true, opacity: 0.16 })
    );
    bg.position.set(0, h * 0.5, -h * 0.7);
    this.holder.add(bg);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // copy out: the shared canvas is about to be reused
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    out.getContext('2d').drawImage(this.canvas, 0, 0);

    this.holder.clear();
    rig.dispose();
    bg.geometry.dispose(); bg.material.dispose();

    this.cache.set(key, out);
    return out;
  }

  /** A larger, posed portrait for the detail panel. */
  getHero(unitId, level = 1, size = { w: 340, h: 200 }) {
    const unit = UNITS[unitId];
    if (!unit) return null;
    const tier = tierOf(level);
    const key = 'hero:' + unitId + ':' + tier;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed || !this._init()) return null;

    this.renderer.setSize(size.w, size.h, false);
    this.camera.aspect = size.w / size.h;
    this.camera.updateProjectionMatrix();

    const rig = buildPortraitModel(unit, tier * 3 + 1);
    this.holder.clear();
    this.holder.add(rig.root);

    const h = rig.height || 1.8;
    const dist = (h * 1.5) / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    this.camera.position.set(dist * 0.5, h * 0.66, dist * 0.86);
    this.camera.lookAt(0, h * 0.46, 0);
    rig.root.rotation.y = -0.65;

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    const out = document.createElement('canvas');
    out.width = size.w; out.height = size.h;
    out.getContext('2d').drawImage(this.canvas, 0, 0, size.w, size.h);

    this.holder.clear();
    rig.dispose();

    // restore the standard size for card thumbs
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();

    this.cache.set(key, out);
    return out;
  }

  /** Drop cached art for a card whose tier just changed. */
  invalidate(unitId) {
    for (const k of [...this.cache.keys()]) {
      if (k.includes(unitId + ':') || k.includes(':' + unitId + ':')) this.cache.delete(k);
    }
  }

  clear() { this.cache.clear(); }
}

export const Thumbs = new ThumbFactory();

/** Put a portrait into a container, or fall back to a role glyph. */
export function paintPortrait(container, unitId, level) {
  const c = Thumbs.get(unitId, level);
  container.innerHTML = '';
  if (c) {
    const img = c.cloneNode(true);
    img.getContext('2d').drawImage(c, 0, 0);
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain';
    container.appendChild(img);
  } else {
    const u = UNITS[unitId];
    const span = document.createElement('div');
    span.className = 'glyph';
    span.textContent = ROLE_GLYPH[u?.role] || '⚔';
    container.appendChild(span);
  }
}

export const ROLE_GLYPH = {
  guardian: '🛡', melee: '⚔', ranged: '🏹', caster: '✨', support: '💚',
  assassin: '🗡', siege: '🪨', summoner: '⚰', beast: '🐺', flyer: '🪽', cavalry: '🐎',
};
