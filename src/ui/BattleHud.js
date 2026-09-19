/* BattleHud.js — everything you read while fighting.

   Kept deliberately sparse. The rule is that the centre 60% of the screen is
   never covered: banners and the clock sit at the top, the hand and Command
   at the bottom, vitals bottom-left, abilities bottom-right, and the middle
   belongs to the battle.
*/

import * as THREE from '../../lib/three.module.js';
import { State } from '../game/State.js';
import { UI } from './UI.js';
import { UNITS, ROLE_INFO } from '../data/Units.js';
import { POTIONS } from '../data/Items.js';
import { SYNERGIES } from '../data/Synergies.js';
import { TUTORIALS } from '../data/Dialogue.js';
import { RARITY, CFG } from '../core/Config.js';
import { MATS } from '../art/Palette.js';
import { paintPortrait } from './Thumbs.js';
import { audio } from '../core/Audio.js';
import { esc, formatTime, clamp, clamp01, formatNum } from '../core/Util.js';
import { ic } from '../art/Icons.js';
import { getFormation } from '../data/Formations.js';
import { ORDER_INFO } from '../battle/Command.js';

const _v = new THREE.Vector3();

export class BattleHud {
  constructor(battle, camera) {
    this.b = battle;
    this.camera = camera;
    this.armed = null;        // index into battle.hand currently selected
    this.el = document.createElement('div');
    this.el.id = 'hud';
    document.getElementById('ui').appendChild(this.el);
    this.floaterEls = [];
    this.logEls = [];
    this._build();
  }

  /* ====================================================================== */

  _build() {
    const b = this.b;
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-side you">
          <div class="lbl"><span>${ic('banner')}</span><span id="h-you-name">Your Banner</span></div>
          <div class="hud-bannerbar"><i id="h-you-bar" style="width:100%"></i></div>
        </div>
        <div class="hud-clock" id="h-clock">
          <div class="t" id="h-time">4:00</div>
          <div class="s" id="h-phase">Battle</div>
        </div>
        <div class="hud-side foe">
          <div class="lbl"><span id="h-foe-name">Enemy Banner</span><span>${ic('banner')}</span></div>
          <div class="hud-bannerbar"><i id="h-foe-bar" style="width:100%"></i></div>
        </div>
      </div>

      <div class="hud-points" id="h-points"></div>
      <div class="bossbar hidden" id="h-boss">
        <div class="bn" id="h-boss-name"></div>
        <div class="bb"><i id="h-boss-bar" style="width:100%"></i></div>
        <div class="bs" id="h-boss-phases"></div>
      </div>
      <div class="synbar" id="h-syn"></div>
      <div class="battlelog" id="h-log"></div>

      <div class="vitals">
        <div class="nm"><span>${esc(State.s.name || 'Commander')}</span><span id="h-hp-txt"></span></div>
        <div class="vbar hp"><i id="h-hp" style="width:100%"></i></div>
        <div class="vbar st"><i id="h-stam" style="width:100%"></i></div>
        <div class="pots" id="h-pots"></div>
      </div>

      <div class="abilbar" id="h-abils"></div>

      <div class="hud-bottom">
        <div class="cmdbar">
          <span class="cmdlab">Command</span>
          <div class="cmdtrack">
            <div class="fill" id="h-cmd"></div>
            <div class="ticks">${'<i></i>'.repeat(CFG.battle.commandMax)}</div>
          </div>
          <span class="cmdnum" id="h-cmdnum">5</span>
        </div>
        <div class="hand" id="h-hand"></div>
      </div>

      <div class="deployhint" id="h-deployhint">Click the ground inside your zone to deploy</div>

      <!-- the command panel: what your army is doing, and how to change it -->
      <div class="cmdpanel" id="h-cmd-panel">
        <div class="cp-head">
          <span class="cp-sel" id="h-cmd-sel">Whole army</span>
          <span class="cp-key"><span class="kbd">T</span> select</span>
        </div>
        <div class="cp-row">
          <span class="cp-lab">Formation</span>
          <span class="cp-val" id="h-cmd-form">Line</span>
          <span class="kbd">F</span>
        </div>
        <div class="cp-row">
          <span class="cp-lab">Order</span>
          <span class="cp-val" id="h-cmd-order">Follow Me</span>
        </div>
        <div class="cp-squads" id="h-cmd-squads"></div>
        <div class="cp-keys">
          <span><span class="kbd">V</span>follow</span><span><span class="kbd">G</span>hold</span>
          <span><span class="kbd">B</span>advance</span><span><span class="kbd">N</span>charge</span>
          <span><span class="kbd">M</span>back</span>
        </div>
      </div>
      <div class="orderflash" id="h-orderflash"></div>
    `;

    this.$ = id => this.el.querySelector('#' + id);
    this._buildPoints();
    this._buildAbilities();
    this._buildPotions();
    this._buildBoss();
    this.rebuildHand();

    // clicking a card arms it
    this.$('h-hand').addEventListener('click', e => {
      const idx = e.target.closest('[data-hand]')?.dataset.hand;
      if (idx === undefined) return;
      this.arm(parseInt(idx, 10));
    });
  }

  _buildPoints() {
    const host = this.$('h-points');
    host.innerHTML = this.b.points.map((p, i) =>
      `<div class="cp" data-cp="${i}"><span class="pip"></span><span>${esc(p.name)}</span>
        <span class="capbar"><i style="width:0%"></i></span></div>`).join('');
  }

  _buildAbilities() {
    const host = this.$('h-abils');
    host.innerHTML = '';
    this.b.player.abilities.forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'abilbtn';
      el.innerHTML = `<span class="k">${a.def.key}</span>${a.def.icon}<div class="cd hidden"></div>`;
      el.dataset.tip = 'cmdab:' + a.def.id;
      el.onclick = () => this.b.player.useAbility(this.b, i);
      host.appendChild(el);
    });
  }

  _buildPotions() {
    const host = this.$('h-pots');
    host.innerHTML = '';
    this.b.player.potions.forEach((p, i) => {
      const def = POTIONS[p.id];
      if (!def) return;
      const el = document.createElement('div');
      el.className = 'potbtn';
      el.innerHTML = `${def.icon}<span class="n">${p.count}</span>`;
      el.dataset.tip = 'potion:' + p.id;
      el.onclick = () => this.b.player.usePotion(this.b, i);
      host.appendChild(el);
    });
  }

  _buildBoss() {
    const boss = this.b.boss;
    if (!boss) return;
    this.$('h-boss').classList.remove('hidden');
    this.$('h-boss-name').textContent = boss.name;
    this.$('h-boss-phases').innerHTML = '<span class="ph on"></span><span class="ph"></span><span class="ph"></span>';
  }

  /* ---------------------------------------------------------------- hand */

  rebuildHand() {
    const b = this.b;
    const host = this.$('h-hand');
    host.innerHTML = '';

    b.hand.forEach((deckIdx, i) => {
      const card = b.playerDeck[deckIdx];
      if (!card) return;
      const u = card.unit;
      const el = document.createElement('div');
      el.className = 'handcard r-' + u.rarity;
      el.style.setProperty('--rc', RARITY[u.rarity].color);
      el.dataset.hand = i;
      el.dataset.tip = 'card:' + u.id + ':' + card.level;
      el.innerHTML = `<div class="art"></div>
        <div class="cost">${u.cost}</div>
        <div class="key">${i + 1}</div>
        <div class="nm">${esc(u.name)}</div>`;
      paintPortrait(el.querySelector('.art'), u.id, card.level);
      host.appendChild(el);
    });

    // next card preview
    if (b.nextCard !== null && b.nextCard !== undefined && b.playerDeck[b.nextCard]) {
      const card = b.playerDeck[b.nextCard];
      const wrap = document.createElement('div');
      wrap.className = 'nextcard';
      wrap.innerHTML = '<div class="lb">Next</div>';
      const mini = document.createElement('div');
      mini.className = 'mini r-' + card.unit.rarity;
      mini.style.setProperty('--rc', RARITY[card.unit.rarity].color);
      mini.innerHTML = `<div class="art"></div><div class="cost">${card.unit.cost}</div>`;
      paintPortrait(mini.querySelector('.art'), card.unit.id, card.level);
      wrap.appendChild(mini);
      host.appendChild(wrap);
    }
  }

  arm(i) {
    const b = this.b;
    if (i === null || i === undefined || i < 0 || i >= b.hand.length) { this.armed = null; this._refreshArmed(); return; }
    const card = b.playerDeck[b.hand[i]];
    if (!card) return;
    if (b.command[0] < card.unit.cost) { audio.play('ui.deny'); return; }
    this.armed = this.armed === i ? null : i;
    audio.play('ui.click');
    this._refreshArmed();
  }

  _refreshArmed() {
    const cards = this.el.querySelectorAll('[data-hand]');
    cards.forEach((c, i) => c.classList.toggle('armed', i === this.armed));
    this.$('h-deployhint').classList.toggle('on', this.armed !== null);
    this.b.deployZone.visible = this.armed !== null;
  }

  /**
   * Show where the armed card will land. Under pointer lock the aim point is
   * the crosshair, so without this marker the player has no idea where a card
   * is going to drop.
   */
  setAim(ground, active) {
    const b = this.b;
    if (!this._aimMesh) {
      const mat = MATS.emissive(0x7fb6e8, 0.55).clone();
      mat.transparent = true;
      this._aimMesh = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.45, 28),
        mat);
      this._aimMesh.rotation.x = -Math.PI / 2;
      this._aimMesh.renderOrder = 6;
      this._aimMesh.visible = false;
      b.scene.add(this._aimMesh);
    }
    const show = !!(active && ground);
    this._aimMesh.visible = show;
    if (!show) return;
    const ok = b.canDeployAt(ground.x, ground.z, 0);
    this._aimMesh.position.set(ground.x, b.field.heightAt(ground.x, ground.z) + 0.06, ground.z);
    this._aimMesh.material.color.setHex(ok ? 0x7fb6e8 : 0xc5362b);
    this._aimMesh.material.opacity = 0.45 + Math.sin(performance.now() / 180) * 0.12;
  }

  /** Called by the battle controller when the player clicks the ground. */
  tryDeploy(x, z) {
    const b = this.b;
    if (this.armed === null) return false;
    const deckIdx = b.hand[this.armed];
    if (deckIdx === undefined) return false;
    if (!b.canDeployAt(x, z, 0)) {
      audio.play('ui.deny');
      UI.toast('Outside your deployment zone', 'bad');
      return false;
    }
    const ok = b.deploy(deckIdx, x, z, 0);
    if (ok) {
      this.armed = null;
      this.rebuildHand();
      this._refreshArmed();
    } else audio.play('ui.deny');
    return ok;
  }

  /* -------------------------------------------------------------- update */

  update(dt) {
    const b = this.b;

    /* banners */
    const b0 = b.structures(0).find(s => s.kind === 'banner');
    const b1 = b.structures(1).find(s => s.kind === 'banner');
    this.$('h-you-bar').style.width = (b0.hp01 * 100).toFixed(1) + '%';
    this.$('h-foe-bar').style.width = (b1.hp01 * 100).toFixed(1) + '%';

    /* clock.
       In a wave battle the clock is meaningless — the fight ends when the
       last wave is dead — so it shows the wave count instead. Showing a
       countdown that does not end the battle is worse than showing nothing. */
    const left = Math.max(0, CFG.battle.duration - b.t);
    if (b.waveMode) {
      this.$('h-time').textContent = `${b.waveNow || 0}/${b.waveTotal || b.director.total}`;
      this.$('h-phase').textContent = 'Wave';
      this.$('h-clock').classList.remove('warn');
    } else {
      this.$('h-time').textContent = formatTime(left);
      this.$('h-phase').textContent = 'Battle';
      this.$('h-clock').classList.toggle('warn', left < 30);
    }
    if (b.state === 'countdown') {
      this.$('h-phase').textContent = 'Starting';
      this.$('h-time').textContent = Math.ceil(b.countdown);
    }

    this._updateCommand();

    /* command */
    const cmd = b.command[0];
    this.$('h-cmd').style.width = (cmd / CFG.battle.commandMax * 100).toFixed(1) + '%';
    this.$('h-cmdnum').textContent = cmd.toFixed(1);

    /* hand affordability */
    this.el.querySelectorAll('[data-hand]').forEach((el, i) => {
      const deckIdx = b.hand[i];
      const card = b.playerDeck[deckIdx];
      el.classList.toggle('cant', !card || cmd < card.unit.cost);
    });

    /* control points */
    b.points.forEach((p, i) => {
      const el = this.el.querySelector(`[data-cp="${i}"]`);
      if (!el) return;
      el.classList.toggle('own', p.owner === 0);
      el.classList.toggle('foe', p.owner === 1);
      el.querySelector('.capbar i').style.width = (p.progress * 100).toFixed(0) + '%';
    });

    /* commander vitals */
    const c = b.player;
    this.$('h-hp').style.width = (c.hp01 * 100).toFixed(1) + '%';
    this.$('h-hp-txt').textContent = c.alive
      ? `${Math.max(0, Math.round(c.hp))} / ${Math.round(c.maxHp)}`
      : `RESPAWN ${Math.ceil(c.respawnT)}s`;
    this.$('h-stam').style.width = (c.stamina / CFG.cmd.staminaMax * 100).toFixed(0) + '%';

    /* abilities */
    this.el.querySelectorAll('.abilbtn').forEach((el, i) => {
      const a = c.abilities[i];
      if (!a) return;
      const cd = el.querySelector('.cd');
      if (a.cd > 0) { cd.classList.remove('hidden'); cd.textContent = Math.ceil(a.cd); el.classList.remove('ready'); }
      else { cd.classList.add('hidden'); el.classList.add('ready'); }
    });

    /* potions */
    this.el.querySelectorAll('.potbtn').forEach((el, i) => {
      const p = c.potions[i];
      if (!p) return;
      const n = el.querySelector('.n');
      if (n) n.textContent = p.count;
      el.classList.toggle('out', p.count <= 0);
    });

    /* boss */
    if (b.boss) {
      this.$('h-boss-bar').style.width = (clamp01(b.boss.hp / b.boss.maxHp) * 100).toFixed(1) + '%';
      const phases = this.$('h-boss-phases').children;
      for (let i = 0; i < phases.length; i++) phases[i].classList.toggle('on', i < b.bossPhaseN);
      if (b.aliveTotems > 0) this.$('h-boss-name').textContent = `${b.boss.name} — protected (${b.aliveTotems} totems)`;
      else if (b.pylons.length) {
        const alive = b.pylons.filter(p => p.alive);
        this.$('h-boss-name').textContent = alive.length
          ? `${b.boss.name} — ${alive.map(p => p.name.replace('Pylon of ', '')).join(', ')}`
          : b.boss.name;
      }
    }

    this._updateFloaters();
    this._updateLog();
  }

  /* ------------------------------------------------------------ floaters */

  _updateFloaters() {
    const b = this.b;
    const layer = document.getElementById('fx-layer');

    // grow the pool as needed
    while (this.floaterEls.length < b.floaters.length) {
      const d = document.createElement('div');
      d.className = 'dmgnum';
      layer.appendChild(d);
      this.floaterEls.push(d);
    }

    for (let i = 0; i < this.floaterEls.length; i++) {
      const el = this.floaterEls[i];
      const f = b.floaters[i];
      if (!f) { el.style.display = 'none'; continue; }
      _v.set(f.x, f.y, f.z).project(this.camera);
      if (_v.z > 1) { el.style.display = 'none'; continue; }
      const sx = (_v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const k = 1 - f.t / f.life;
      el.style.display = '';
      el.className = 'dmgnum ' + f.cls;
      el.textContent = f.text;
      el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px) scale(${(0.8 + k * 0.4).toFixed(2)})`;
      el.style.opacity = k.toFixed(2);
    }
  }

  /* ------------------------------------------------------------- log/syn */

  pushLog(text, team) {
    const host = this.$('h-log');
    const el = document.createElement('div');
    el.className = 'blog ' + (team === 0 ? 'good' : 'bad');
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
    while (host.children.length > 5) host.firstChild.remove();
  }

  setSynergies(list) {
    const host = this.$('h-syn');
    host.innerHTML = list.map(s =>
      `<div class="syn"><span class="si">${s.def?.icon || ic('spark')}</span>
        <span>${esc(s.def?.name || s.id)}</span>
        <span class="sd">×${s.n}</span></div>`).join('');
  }

  _updateLog() { /* entries expire on their own timers */ }

  /* ------------------------------------------------------------ command */

  /**
   * The army panel. It answers the two questions you have while commanding:
   * who am I talking to, and what did I just tell them to do.
   */
  _updateCommand() {
    const army = this.b.army;
    if (!army) return;
    const live = army.live;
    const sel = army.selected >= 0 ? live[army.selected] : null;

    this.$('h-cmd-panel').classList.toggle('hidden', !live.length);
    if (!live.length) return;

    this.$('h-cmd-sel').textContent = sel ? `${sel.name} squad` : `Whole army — ${live.length} squads`;
    this.$('h-cmd-form').textContent = getFormation(sel ? sel.formationId : army.formationId).name;
    this.$('h-cmd-order').textContent = ORDER_INFO[sel ? sel.order : army.order]?.name || '—';

    const host = this.$('h-cmd-squads');
    const sig = live.map(s => `${s.cardId}${s.living.length}${s.formationId}${s.order}`).join('|') + army.selected;
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      host.innerHTML = live.map((s, i) => `
        <div class="cps${i === army.selected ? ' on' : ''}">
          <span class="cps-n">${esc(s.name)}</span>
          <span class="cps-c">${s.living.length}</span>
          <span class="cps-f">${esc(getFormation(s.formationId).name)}</span>
          <span class="cps-o">${esc(ORDER_INFO[s.order]?.name || '')}</span>
        </div>`).join('');
    }
  }

  /** A big, brief confirmation that the army heard you. */
  orderFeedback(text, kind) {
    const el = this.$('h-orderflash');
    if (!el) return;
    el.textContent = text;
    el.className = 'orderflash ' + (kind || '');
    void el.offsetWidth;
    el.classList.add('go');
    clearTimeout(this._orderT);
    this._orderT = setTimeout(() => el.classList.remove('go'), 1100);
  }

  /* -------------------------------------------------------------- hints */

  showTutorial(key) {
    if (!State.s.settings.tutorialHints) return;
    const t = TUTORIALS[key];
    if (!t) return;
    if (State.s.flags['tut_' + key]) return;
    State.setFlag('tut_' + key, true);

    UI.overlay(`
      <div class="h-rule"><h2>${esc(t.title)}</h2></div>
      <div class="col gap6" style="font-size:14.5px;line-height:1.7">
        ${t.lines.map(l => `<div>• ${l}</div>`).join('')}
      </div>
      <div class="rowflex mt16" style="justify-content:flex-end"><div class="btn gold" data-ok>Understood</div></div>
    `, (el, close) => {
      el.querySelector('[data-ok]').onclick = () => { audio.play('ui.click'); close(); };
    });
  }

  /**
   * One sentence of coaching, above the hand, for as long as it is useful.
   *
   * This is deliberately NOT `showTutorial`'s modal. A wave battle teaches
   * while the fight is happening; a box that has to be dismissed would stop
   * the thing it is trying to explain.
   */
  showTeach(text) {
    if (!text) return;
    if (!this._teach) {
      this._teach = document.createElement('div');
      this._teach.className = 'teachline';
      this.el.appendChild(this._teach);
    }
    this._teach.innerHTML = `<span class="tl-ic">${ic('quest')}</span><span>${esc(text)}</span>`;
    this._teach.classList.remove('out');
    void this._teach.offsetWidth;
    this._teach.classList.add('in');
    clearTimeout(this._teachT);
    this._teachT = setTimeout(() => {
      this._teach?.classList.remove('in');
      this._teach?.classList.add('out');
    }, 8600);
  }

  callout(big, small) { UI.callout(big, small); }

  destroy() {
    clearTimeout(this._teachT);
    clearTimeout(this._orderT);
    this.el.remove();
    for (const e of this.floaterEls) e.remove();
    this.floaterEls.length = 0;
    if (this._aimMesh) {
      this.b.scene.remove(this._aimMesh);
      this._aimMesh.geometry.dispose();
      this._aimMesh.material.dispose();
      this._aimMesh = null;
    }
  }
}

/* ------------------------------------------------------------- tooltips */

UI.addTipProvider((key) => {
  if (key.startsWith('cmdab:')) {
    const id = key.slice(6);
    const list = State.commanderAbilities();
    const a = list.find(x => x.id === id);
    if (!a) return null;
    return `<h4>${a.icon} ${esc(a.name)}</h4><div class="tip-sub">Key ${a.key} · ${a.cd}s cooldown</div><div>${esc(a.desc)}</div>`;
  }
  if (key.startsWith('potion:')) {
    const p = POTIONS[key.slice(7)];
    if (!p) return null;
    return `<h4>${p.icon} ${esc(p.name)}</h4><div>${esc(p.desc)}</div>`;
  }
  return null;
});
