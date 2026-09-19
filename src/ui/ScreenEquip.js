/* ScreenEquip.js — your commander: what you are wearing and what it does.

   The character preview is a live turntable of the actual battle model, so
   swapping a helmet changes the picture immediately. Stat deltas are shown
   against what you have equipped now, which is the only comparison that
   matters when you are standing in front of a chest of loot.
*/

import * as THREE from '../../lib/three.module.js';
import { State } from '../game/State.js';
import { UI } from './UI.js';
import { section, empty, itemCell, itemTooltip, costList } from './Widgets.js';
import { ITEMS, SLOTS, SLOT_ORDER, itemStatsAt, aggregateStats, canEquip, WEAPON_CLASSES, CMD_ABILITIES, POTIONS } from '../data/Items.js';
import { RARITY, CFG } from '../core/Config.js';
import { buildCommanderPortrait } from '../art/CommanderArt.js';
import { audio } from '../core/Audio.js';
import { esc, commas, clamp, TAU } from '../core/Util.js';

let pickingSlot = null;

export const ScreenEquip = {
  id: 'equip',
  _view: null,

  build(el, args, ui) {
    const parts = ui.scaffold(el, {
      icon: '🎖',
      title: 'The Commander',
      blurb: 'Heavy stops more and slows you. Light keeps you alive by not being there. Weight is the honest cost.',
    });
    build(parts.body, ui, this);
  },

  destroy() {
    if (this._view) { this._view.dispose(); this._view = null; }
  },

  update(dt) { this._view?.update(dt); },
};

function build(body, ui, screen) {
  const layout = document.createElement('div');
  layout.className = 'equiplayout';
  body.appendChild(layout);

  const colL = document.createElement('div');
  const colM = document.createElement('div');
  const colR = document.createElement('div');
  layout.append(colL, colM, colR);

  /* ------------------------------------------------------------ slots */
  colL.className = 'slotcol';
  const eqIds = State.equippedIds();
  for (const slot of SLOT_ORDER) {
    const uid = State.s.equipped[slot];
    const it = uid && State.itemByUid(uid);
    const def = it && ITEMS[it.id];
    const row = document.createElement('div');
    row.className = 'eqslot' + (def ? '' : ' empty');
    row.style.setProperty('--rc', def ? RARITY[def.rarity].color : '#3d4453');
    row.innerHTML = `
      <div class="ic">${def ? def.icon : SLOTS[slot].icon}</div>
      <div class="tx">
        <div class="sl">${SLOTS[slot].name}</div>
        <div class="nm">${def ? esc(def.name) : 'Empty'}</div>
      </div>
      <div class="lv">${it && it.level > 1 ? '+' + (it.level - 1) : ''}</div>`;
    if (def) row.dataset.tip = 'item:' + it.uid;
    row.onclick = () => openPicker(slot, ui);
    colL.appendChild(row);
  }

  /* ------------------------------------------------------- 3D preview */
  const view = document.createElement('div');
  view.className = 'charview';
  view.innerHTML = '<div class="rotnote">drag to rotate</div>';
  colM.appendChild(view);
  screen._view = new CharView(view);

  /* -------------------------------------------------------- stat block */
  const st = State.commanderStats();
  const abilities = State.commanderAbilities();

  colR.appendChild(section('Attributes', ''));
  const sb = document.createElement('div');
  sb.className = 'statblock';
  const rows = [
    ['Health', commas(st.maxHp)],
    ['Might', st.might, 'Melee weapon damage'],
    ['Focus', st.focus, 'Ability and staff damage'],
    ['Armour', st.armor, 'Flat damage reduction'],
    ['Haste', st.haste, 'Swing speed and cooldowns'],
    ['Weight', st.weight, 'Subtracted from move speed'],
    ['Move speed', st.moveSpeed.toFixed(2) + ' m/s'],
    ['Cooldown rate', '−' + Math.round(st.cdr * 100) + '%'],
    ['Weapon', WEAPON_CLASSES[st.weaponClass]?.name || st.weaponClass],
  ];
  sb.innerHTML = rows.map(([k, v, tip]) =>
    `<div class="sbrow"${tip ? ` data-tip="raw:${esc(tip)}"` : ''}><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
  colR.appendChild(sb);

  /* --------------------------------------------------------- specials */
  const specials = Object.entries(st.specials || {}).filter(([k]) => k !== 'ability');
  if (specials.length) {
    colR.appendChild(section('Set Effects', ''));
    const list = document.createElement('div');
    list.className = 'col gap6';
    for (const [k, v] of specials) {
      const row = document.createElement('div');
      row.className = 'sbrow';
      row.innerHTML = `<span class="k">${k}</span><span class="v">${typeof v === 'number' ? (v < 1 && v > 0 ? Math.round(v * 100) + '%' : v) : '✓'}</span>`;
      list.appendChild(row);
    }
    colR.appendChild(list);
  }

  /* -------------------------------------------------------- abilities */
  colR.appendChild(section('Battle Abilities', 'Q, E and R in battle. Gear grants the third.'));
  for (const a of abilities) {
    const row = document.createElement('div');
    row.className = 'abil';
    row.innerHTML = `<div class="ai">${a.icon}</div>
      <div><div class="an">${esc(a.name)} <span class="tag">${a.key}</span> <span class="tag">${a.cd}s</span></div>
      <div class="ad">${esc(a.desc)}</div></div>`;
    colR.appendChild(row);
  }

  /* ---------------------------------------------------------- potions */
  colR.appendChild(section('Potion Belt', ''));
  const belt = document.createElement('div');
  belt.className = 'rowflex gap6';
  for (let i = 0; i < State.potionSlotCount(); i++) {
    const id = State.s.potionSlots[i];
    const def = id && POTIONS[id];
    const b = document.createElement('div');
    b.className = 'potbtn' + (def && State.s.potions[id] ? '' : ' out');
    b.innerHTML = `${def ? def.icon : '—'}${def ? `<span class="n">${State.s.potions[id] || 0}</span>` : ''}`;
    belt.appendChild(b);
  }
  colR.appendChild(belt);

  /* --------------------------------------------------- inventory grid */
  const invWrap = document.createElement('div');
  invWrap.className = 'mt16';
  invWrap.style.gridColumn = '1/-1';
  invWrap.appendChild(section('Everything You Own', 'Click an item to equip it.'));
  const inv = document.createElement('div');
  inv.className = 'itemlist';
  const equippedUids = new Set(Object.values(State.s.equipped));
  const sorted = State.s.items.slice().sort((a, b) =>
    RARITY[ITEMS[b.id].rarity].order - RARITY[ITEMS[a.id].rarity].order || b.level - a.level);
  if (!sorted.length) inv.appendChild(empty('Nothing yet. Go and forge something.'));
  for (const it of sorted) {
    inv.appendChild(itemCell(it, {
      equipped: equippedUids.has(it.uid),
      onClick: (item) => {
        const def = ITEMS[item.id];
        const slot = def.family === 'trinket'
          ? (State.s.equipped.trinket1 && !State.s.equipped.trinket2 ? 'trinket2' : 'trinket1')
          : def.slot;
        if (State.equipItem(item.uid, slot)) { audio.play('ui.click'); ui.refresh(); }
        else { audio.play('ui.deny'); UI.toast('That cannot go there with your current weapon', 'bad'); }
      },
    }));
  }
  invWrap.appendChild(inv);
  layout.appendChild(invWrap);
}

/* ==========================================================================
   SLOT PICKER
   ========================================================================== */

function openPicker(slot, ui) {
  const eq = State.equippedIds();
  const candidates = State.s.items.filter(it => canEquip(ITEMS[it.id], slot, eq));
  const cur = State.s.equipped[slot];
  const curDef = cur ? ITEMS[State.itemByUid(cur)?.id] : null;
  const curStats = curDef ? itemStatsAt(curDef, State.itemByUid(cur).level) : {};

  const rows = candidates.map(it => {
    const def = ITEMS[it.id];
    const st = itemStatsAt(def, it.level);
    const delta = Object.keys({ ...st, ...curStats }).map(k => {
      const d = (st[k] || 0) - (curStats[k] || 0);
      if (!d) return '';
      const good = k === 'weight' ? d < 0 : d > 0;
      return `<span class="d ${good ? 'pos' : 'neg'}">${LBL[k] || k} ${d > 0 ? '+' : ''}${d}</span>`;
    }).join(' ');
    return `<div class="dopt" data-uid="${it.uid}" data-tip="item:${it.uid}">
      <span style="font-size:19px">${def.icon}</span>
      <span style="color:${RARITY[def.rarity].color}">${esc(def.name)}${it.level > 1 ? ' +' + (it.level - 1) : ''}</span>
      <span class="rq" style="color:var(--vel-3);font-family:var(--f-mono);font-size:11px">${delta}</span>
    </div>`;
  }).join('');

  UI.overlay(`
    <div class="h-rule"><h2>${SLOTS[slot].name}</h2></div>
    <div class="opts" style="max-height:52vh;overflow:auto">
      ${rows || '<div class="empty-note">Nothing you own fits this slot.</div>'}
      ${cur ? '<div class="dopt" data-uid="none"><span>✖</span><span>Remove</span></div>' : ''}
    </div>`, (el, close) => {
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-uid]');
      if (!t) return;
      if (t.dataset.uid === 'none') State.unequipSlot(slot);
      else State.equipItem(parseInt(t.dataset.uid, 10), slot);
      audio.play('ui.click');
      close();
      ui.refresh();
    });
  });
}

const LBL = { might: '⚔', focus: '✨', vigor: '❤', armor: '🛡', haste: '⚡', weight: '⚖' };

/* ==========================================================================
   LIVE CHARACTER PREVIEW
   ========================================================================== */

class CharView {
  constructor(host) {
    this.host = host;
    this.angle = 0.6;
    this.dragging = false;
    this.ok = false;
    try {
      this.canvas = document.createElement('canvas');
      host.appendChild(this.canvas);
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

      const key = new THREE.DirectionalLight(0xfff0dc, 1.6); key.position.set(3, 6, 4);
      const fill = new THREE.DirectionalLight(0x8aa8c8, 0.5); fill.position.set(-4, 2, 3);
      const rim = new THREE.DirectionalLight(0xbfd8ff, 1.3); rim.position.set(-2, 3, -5);
      const amb = new THREE.HemisphereLight(0x9ab4d0, 0x40382c, 0.8);
      this.scene.add(key, fill, rim, amb);

      this.holder = new THREE.Group();
      this.scene.add(this.holder);

      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.45, 0.1, 28),
        new THREE.MeshLambertMaterial({ color: 0x2a2f3a }));
      disc.position.y = -0.05;
      this.scene.add(disc);
      this.disc = disc;

      this.rebuild();
      this._resize();
      this.ok = true;

      host.addEventListener('pointerdown', e => { this.dragging = true; this.lastX = e.clientX; });
      addEventListener('pointerup', () => { this.dragging = false; });
      addEventListener('pointermove', e => {
        if (!this.dragging) return;
        this.angle -= (e.clientX - this.lastX) * 0.01;
        this.lastX = e.clientX;
      });
      this._onResize = () => this._resize();
      addEventListener('resize', this._onResize);
    } catch (e) {
      console.warn('[equip] no preview context', e);
      host.innerHTML = '<div class="empty-note">Character preview unavailable.</div>';
    }
  }

  rebuild() {
    if (this.rig) { this.holder.remove(this.rig.root); this.rig.dispose(); }
    this.rig = buildCommanderPortrait(State.equippedIds(), { team: 0 });
    this.holder.add(this.rig.root);
  }

  _resize() {
    if (!this.renderer) return;
    const r = this.host.getBoundingClientRect();
    const w = Math.max(80, r.width), h = Math.max(80, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const dist = 2.5 / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2)) * 2.3;
    this.camera.position.set(0, 1.25, dist);
    this.camera.lookAt(0, 0.95, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.ok) return;
    if (!this.dragging) this.angle += dt * 0.25;
    this.holder.rotation.y = this.angle;
    if (this.rig) {
      this.rig.update(dt, {
        moving: 0, attacking: 0, casting: 0, dead: 0, hurt: 0,
        speedFactor: 0.7, blocking: false, drawing: 0, dodging: 0,
      });
    }
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    if (this.rig) this.rig.dispose();
    if (this.disc) { this.disc.geometry.dispose(); this.disc.material.dispose(); }
    this.renderer?.dispose();
  }
}

/* tooltip provider for item cells */
UI.addTipProvider((key) => {
  if (key.startsWith('item:')) {
    const uid = parseInt(key.slice(5), 10);
    const it = State.itemByUid(uid);
    return it ? itemTooltip(it) : null;
  }
  if (key.startsWith('raw:')) return `<div>${key.slice(4)}</div>`;
  return null;
});
