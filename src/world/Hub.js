/* Hub.js — walking around the world between battles.

   Owns the current zone, your character in it, the follow camera, the
   interaction prompt and the navigation dock. Zone changes are a fade, a
   rebuild and a lighting cross-fade, so the keep, the Library and the forge
   feel like one continuous place rather than five menus.
*/

import * as THREE from '../../lib/three.module.js';
import { MATS } from '../art/Palette.js';
import { State } from '../game/State.js';
import { UI } from '../ui/UI.js';
import { input } from '../core/Input.js';
import { audio } from '../core/Audio.js';
import { CFG } from '../core/Config.js';
import { bus, EV } from '../core/Bus.js';
import { buildZone } from './Zones.js';
import { NPC, talkTo, closeDialogue, dialogueOpen } from './NPCs.js';
import { buildCommanderModel, updateCommanderRig } from '../art/CommanderArt.js';
import { nextActions } from '../game/Progression.js';
import { clamp, clamp01, damp, angleDelta, lerp, TAU, esc } from '../core/Util.js';
import { ic } from '../art/Icons.js';
import { AmbientCrowd } from './Ambient.js';
import { Objective } from '../ui/Objective.js';
import { Tutorial } from '../game/Tutorial.js';

/** Character facing is atan2(dz, dx); the rig's yaw is atan2(dx, dz). */
const yawFromFacing = a => Math.atan2(Math.cos(a), Math.sin(a));

export class Hub {
  constructor(o) {
    this.scene = o.scene;
    this.camera = o.camera;
    this.sky = o.sky;
    this.fx = o.fx;
    this.lightPool = o.lights;

    this.zone = null;
    this.zoneId = null;
    this.npcs = [];
    this.t = 0;

    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.facing = Math.PI / 2;
    this.speedNow = 0;

    // The camera lives in the shared rig (o.cam). The hub does not own a yaw,
    // a distance or a placement routine of its own — there is exactly one.
    this.cam = o.cam;

    this.rig = null;
    this.prompt = null;
    this.dock = null;
    this.zoneTitle = null;
    this.nearest = null;
    this.active = false;
    this.crowd = null;
    this.exitDoor = null;      // the door back to the courtyard, if any
    this.exitBeacon = null;

    this._buildDock();
    this._buildPrompt();
    this._buildExitBar();
  }

  /* ====================================================================== */

  enter(zoneId, opts = {}) {
    this.active = true;
    this.load(zoneId, opts);
    this.dock.style.display = '';
    UI.showTopbar(true);
  }

  exit() {
    this.active = false;
    this.unload();
    this.dock.style.display = 'none';
    this.prompt.classList.add('hidden');
    this.exitBar?.classList.add('hidden');
    closeDialogue();
  }

  load(zoneId, opts = {}) {
    this.unload();
    this.zoneId = zoneId;
    const z = buildZone(zoneId);
    this.zone = z;
    this.scene.add(z.group);

    this.sky.apply(z.atmos, opts.instant);
    if (z.sky?.clouds) this.sky.addClouds(0xffffff, 12);
    else this.sky.addClouds(0xffffff, 0);

    // Zone lights. The pool takes every source the zone declares and decides
    // each frame which ones get a real light — a zone is free to be as lit as
    // it likes without anyone counting draw calls by hand.
    this.lightPool.setSources(z.lights || []);

    // NPCs
    for (const n of z.npcs || []) {
      const npc = new NPC(n.id, n.x, n.z, n.facing);
      this.scene.add(npc.group);
      this.npcs.push(npc);
    }

    // the garrison: nameless people going about their business
    if (z.crowd?.length) this.crowd = new AmbientCrowd(this.scene, z.crowd);

    /* --- the way back. Every zone that is not the courtyard gets a beacon
       over its exit and a permanent bar at the top of the screen. Leaving
       must never depend on the player happening to walk into the right
       corner of the room. --- */
    this.exitDoor = (z.doors || []).find(d => d.exit) || null;
    this._buildExitBeacon();
    this._refreshExitBar();

    // the player
    if (!this.rig) {
      this.rig = buildCommanderModel(State.equippedIds(), { team: 0 });
      this.scene.add(this.rig.root);
    }
    const sp = opts.spawn || z.spawn;
    this.pos.x = sp.x; this.pos.z = sp.z;

    // Face INTO the room. Spawns sit just inside a door, so a fixed facing
    // pointed half of them at the back wall — and with the camera behind you
    // the boom then collapses into a close-up of your own head.
    if (opts.facing !== undefined) {
      this.facing = opts.facing;
    } else {
      const b = z.bounds;
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const dx = cx - sp.x, dz = cz - sp.z;
      this.facing = (Math.abs(dx) + Math.abs(dz) > 0.5)
        ? Math.atan2(dz, dx)
        : Math.PI / 2;
    }

    // Aim the camera along the character's facing. `facingYaw` and the rig's
    // own yaw use the same convention, so this is a straight conversion.
    // The camera gets MORE room than the character. `z.bounds` is the walkable
    // area, already inset a couple of metres from the actual walls; using it
    // directly for the boom squashed the camera into the back of your head.
    const cb = z.camMargin ?? 1.9;
    this.cam.setBounds({
      x0: z.bounds.x0 - cb, x1: z.bounds.x1 + cb,
      z0: z.bounds.z0 - cb, z1: z.bounds.z1 + cb,
    });
    this.cam.setProbe(null);        // hub zones are flat
    this.cam.setBlockers(null);
    this.cam.reset({
      x: this.pos.x, y: 0, z: this.pos.z,
      yaw: yawFromFacing(this.facing),
      preset: 'hub',
    });

    this._showZoneTitle(z);
    this._refreshDock();
    Tutorial.setZone(zoneId);
    bus.emit(EV.ZONE_ENTER, { id: zoneId });
    audio.setMusic(zoneId === 'library' ? 'library' : zoneId === 'forge' ? 'forge' : 'hub');
  }

  unload() {
    if (this.zone) {
      this.scene.remove(this.zone.group);
      this.zone.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.zone = null;
    }
    for (const n of this.npcs) { this.scene.remove(n.group); n.dispose(); }
    this.npcs.length = 0;
    if (this.crowd) { this.crowd.dispose(); this.crowd = null; }
    if (this.exitBeacon) { this.scene.remove(this.exitBeacon); this.exitBeacon = null; }
    this.lightPool.releaseAll();
  }

  /* ---------------------------------------------------------- the way out */

  /** A tall soft pillar of light over the exit, visible across the room. */
  _buildExitBeacon() {
    if (!this.exitDoor) return;
    const g = new THREE.Group();
    const col = 0xbcd6ec;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.5, 9, 10, 1, true),
      MATS.emissive(col, 0.13));
    shaft.position.y = 4.5;
    shaft.renderOrder = 3;
    g.add(shaft);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.4, 26),
      MATS.emissive(col, 0.22));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    disc.renderOrder = 3;
    g.add(disc);
    g.position.set(this.exitDoor.x, 0, this.exitDoor.z);
    g.userData.pulse = (t) => {
      const k = 0.88 + Math.sin(t * 1.5) * 0.12;
      disc.scale.setScalar(k);
      shaft.material.opacity = 0.10 + Math.sin(t * 1.5) * 0.035;
    };
    this.scene.add(g);
    this.exitBeacon = g;
  }

  _buildExitBar() {
    const el = document.createElement('div');
    el.className = 'exitbar hidden';
    el.innerHTML = `<span class="ex-ic">${ic('castle')}</span>
      <span class="ex-t">Return to the Courtyard</span>
      <span class="kbd">E</span><span class="ex-s">at the doorway</span>`;
    el.addEventListener('click', () => {
      if (this.zoneId && this.zoneId !== 'keep') { audio.play('ui.click'); this.transitionTo('keep'); }
    });
    document.getElementById('ui').appendChild(el);
    this.exitBar = el;
  }

  _refreshExitBar() {
    if (!this.exitBar) return;
    this.exitBar.classList.toggle('hidden', !this.exitDoor);
  }

  /** Rebuild the player model after an equipment change. */
  refreshModel() {
    if (!this.rig) return;
    this.scene.remove(this.rig.root);
    this.rig.dispose();
    this.rig = buildCommanderModel(State.equippedIds(), { team: 0 });
    this.scene.add(this.rig.root);
  }

  /* ====================================================================== */

  update(dt) {
    if (!this.active || !this.zone) return;
    this.t += dt;

    const blocked = UI.isOpen || dialogueOpen();
    input.blocked = blocked;

    /* ------------------------------------------------------------ camera
       Look first, then move: the movement basis must come from the camera
       orientation the player can see THIS frame, not the previous one. */
    if (blocked) {
      // stop any rotation still in flight, so the view behind the menu holds
      // exactly still instead of quietly easing onward
      this.cam.settleTargets();
    } else {
      const look = input.lookDelta();
      this.cam.look(look.x, look.y);
      if (input.mouse.wheel) this.cam.zoom(input.mouse.wheel);
    }
    this.cam.setFocus(this.pos.x, 0, this.pos.z);
    this.cam.update(dt);

    /* ---------------------------------------------------------- movement */
    const mv = blocked ? { x: 0, y: 0 } : input.moveAxis();

    // Camera-relative, straight from the rig, so the two can never disagree:
    // W is always into the screen, D is always screen-right.
    const world = this.cam.moveVector(mv.x, mv.y);
    const wx = world.x, wz = world.z;

    const running = !blocked && input.down('ShiftLeft', 'ShiftRight');
    const speed = running ? CFG.world.runSpeed : CFG.world.walkSpeed;
    const len = Math.hypot(wx, wz);

    if (len > 0.01) {
      this.vel.x = damp(this.vel.x, wx * speed, 12, dt);
      this.vel.z = damp(this.vel.z, wz * speed, 12, dt);
      const want = Math.atan2(wz, wx);
      this.facing += clamp(angleDelta(this.facing, want), -CFG.world.turnRate * dt, CFG.world.turnRate * dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }

    const b = this.zone.bounds;
    this.pos.x = clamp(this.pos.x + this.vel.x * dt, b.x0, b.x1);
    this.pos.z = clamp(this.pos.z + this.vel.z * dt, b.z0, b.z1);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);

    /* --------------------------------------------------------- the model */
    this.rig.root.position.set(this.pos.x, 0, this.pos.z);
    this.rig.pivot.rotation.y = -this.facing + Math.PI / 2;
    updateCommanderRig(this.rig, dt, {
      moving: clamp01(this.speedNow / CFG.world.walkSpeed),
      attacking: 0, casting: 0, dead: 0, hurt: 0,
      speedFactor: running ? 1.35 : 1.0, blocking: false, drawing: 0, dodging: 0,
    });

    /* ------------------------------------------------------------- npcs */
    for (const n of this.npcs) n.update(dt, this.t);
    this.crowd?.update(dt);
    this.exitBeacon?.userData.pulse?.(this.t);

    /* -------------------------------------------------- guidance overlays
       The compass points at whatever the current objective is; failing that,
       at the way out, but only once the player has wandered away from it. */
    const objAt = Objective.target;
    if (!objAt && this.exitDoor) {
      const d = Math.hypot(this.exitDoor.x - this.pos.x, this.exitDoor.z - this.pos.z);
      if (d > 9) Objective.target = { x: this.exitDoor.x, z: this.exitDoor.z, label: 'Courtyard' };
    }
    Objective.updateCompass(this.camera, THREE);
    if (!objAt) Objective.target = null;

    this.sky.update(dt, this.pos.x, this.pos.z);

    /* ------------------------------------------------------ interaction */
    this._updateInteraction(blocked);

    /* ------------------------------------------------------- animations */
    for (const a of this.zone.animated || []) if (a.userData.update) a.userData.update(this.t);
    this.lightPool.update(dt, this.t, this.pos.x, this.pos.z);
    this.fx.update(dt);

    /* ------------------------------------------------- ambient flourishes */
    if (this.zoneId === 'forge' && Math.random() < dt * 8) {
      this.fx.particle({
        x: (Math.random() - 0.5) * 2, y: 1.3, z: -9.5 + (Math.random() - 0.5) * 1.2,
        vy: 1.6 + Math.random() * 1.4, vx: (Math.random() - 0.5), vz: (Math.random() - 0.5),
        color: Math.random() < 0.5 ? 0xffd479 : 0xe8823a, size: 0.07, life: 1.4, drag: 0.7,
      });
    }
    if (this.zoneId === 'library' && Math.random() < dt * 3) {
      this.fx.particle({
        x: (Math.random() - 0.5) * 14, y: 0.5 + Math.random() * 6, z: (Math.random() - 0.5) * 24,
        vy: -0.12, color: 0xd9c98a, size: 0.05, life: 3.5, drag: 0.1, alpha: 0.5,
      });
    }
    if (this.zoneId === 'library' && Math.random() < dt * 0.8) audio.play('page', { vol: 0.25 });
    if (this.zoneId === 'forge' && Math.random() < dt * 0.35) audio.play('anvil', { vol: 0.45 });
    if (this.zoneId === 'library' && Math.random() < dt * 1.2) audio.play('bubble', { vol: 0.3, pan: 0.5 });
  }

  /* -------------------------------------------------------- interaction */

  _updateInteraction(blocked) {
    let best = null, bestD = CFG.world.interactRange;

    for (const it of this.zone.interactables || []) {
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      if (d < (it.r || CFG.world.interactRange) && d < bestD + 2) { best = { kind: 'act', it }; bestD = d; }
    }
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      if (d < 3.4 && d < bestD + 1) { best = { kind: 'npc', npc: n }; bestD = d; }
    }
    for (const dr of this.zone.doors || []) {
      const d = Math.hypot(dr.x - this.pos.x, dr.z - this.pos.z);
      if (d < 3.6 && d < bestD + 1) { best = { kind: 'door', door: dr }; bestD = d; }
    }

    this.nearest = best;

    if (!best || blocked) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.classList.remove('hidden');
    const label = best.kind === 'npc' ? best.npc.def.name
      : best.kind === 'door' ? `Enter ${best.door.label}`
        : best.it.label;
    const sub = best.kind === 'npc' ? best.npc.def.title
      : best.kind === 'door' ? '' : (best.it.sub || '');
    const icon = best.kind === 'npc' ? best.npc.def.icon
      : best.kind === 'door' ? best.door.icon : best.it.icon;
    this.prompt.innerHTML = `<div class="k">E</div>
      <div class="t">${icon} ${esc(label)}</div>
      ${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;

    // E only. Left-click is what engages camera control, so making it also
    // interact would fire an interaction every time the player grabs the mouse.
    if (input.pressed('KeyE')) this._interact(best);
  }

  _interact(best) {
    audio.play('ui.click');
    if (best.kind === 'door') {
      this.transitionTo(best.door.to);
      return;
    }
    if (best.kind === 'npc') {
      talkTo(best.npc.id, (action) => this.onAction?.(action));
      return;
    }
    this.onAction?.(best.it.action);
  }

  transitionTo(zoneId) {
    audio.play('door');
    const fade = document.createElement('div');
    fade.style.cssText = 'position:fixed;inset:0;z-index:100;background:#07080b;opacity:0;transition:opacity .28s ease;pointer-events:none';
    document.body.appendChild(fade);
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    setTimeout(() => {
      this.load(zoneId, { instant: false });
      fade.style.opacity = '0';
      setTimeout(() => fade.remove(), 320);
    }, 300);
  }

  /* ---------------------------------------------------------------- UI */

  _buildPrompt() {
    this.prompt = document.createElement('div');
    this.prompt.className = 'worldhint hidden';
    document.getElementById('ui').appendChild(this.prompt);
  }

  _showZoneTitle(z) {
    if (this.zoneTitle) this.zoneTitle.remove();
    const el = document.createElement('div');
    el.className = 'zonetitle';
    el.innerHTML = `<h2>${esc(z.name)}</h2><p>${esc(z.sub || '')}</p>`;
    document.getElementById('ui').appendChild(el);
    this.zoneTitle = el;
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 1000); }, 2600);
  }

  _buildDock() {
    const el = document.createElement('div');
    el.className = 'dock';
    // "Courtyard" is first and always present. It is hidden only while you
    // are already standing in it — a player who is lost should find the way
    // home in the same place every time, not have to remember a doorway.
    el.innerHTML = `
      <div class="dockbtn home" data-go="courtyard"><span class="ic">${ic('castle')}</span><span class="lb">Courtyard</span></div>
      <div class="docksep"></div>
      <div class="dockbtn" data-go="map"><span class="ic">${ic('map')}</span><span class="lb">War Map</span></div>
      <div class="dockbtn" data-go="army"><span class="ic">${ic('banner')}</span><span class="lb">Army</span></div>
      <div class="dockbtn" data-go="equip"><span class="ic">${ic('medal')}</span><span class="lb">Commander</span></div>
      <div class="dockbtn" data-go="library"><span class="ic">${ic('mage')}</span><span class="lb">Library</span></div>
      <div class="dockbtn" data-go="forge"><span class="ic">${ic('hammer')}</span><span class="lb">Forge</span></div>
      <div class="dockbtn" data-go="shop"><span class="ic">${ic('purse')}</span><span class="lb">Market</span></div>`;
    document.getElementById('ui').appendChild(el);
    this.dock = el;
    el.addEventListener('click', e => {
      const go = e.target.closest('[data-go]')?.dataset.go;
      if (!go) return;
      audio.play('ui.click');
      if (go === 'courtyard') { this.transitionTo('keep'); return; }
      this.onAction?.(go);
    });
  }

  _refreshDock() {
    // hide the way home only while you are already home
    const home = this.dock.querySelector('[data-go="courtyard"]');
    const sep = this.dock.querySelector('.docksep');
    const atHome = this.zoneId === 'keep';
    if (home) home.classList.toggle('hidden', atHome);
    if (sep) sep.classList.toggle('hidden', atHome);

    const acts = nextActions();
    const map = { upgrade: 'library', research: 'library', craft: 'forge', quest: 'army', deck: 'army' };
    const counts = {};
    for (const a of acts) {
      const target = map[a.kind];
      if (target) counts[target] = (counts[target] || 0) + a.n;
    }
    for (const btn of this.dock.querySelectorAll('[data-go]')) {
      const go = btn.dataset.go;
      btn.querySelector('.badge')?.remove();
      if (counts[go]) {
        const b = document.createElement('div');
        b.className = 'badge';
        b.textContent = counts[go] > 9 ? '9+' : counts[go];
        btn.appendChild(b);
      }
    }
  }

  refreshBadges() { if (this.dock) this._refreshDock(); }

  dispose() {
    this.unload();
    if (this.rig) { this.scene.remove(this.rig.root); this.rig.dispose(); }
    this.dock?.remove();
    this.prompt?.remove();
    this.exitBar?.remove();
  }
}
