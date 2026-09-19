/* UI.js — the interface shell: top bar, screen stack, toasts, tooltips.

   Screens are plain objects with { id, build(root), destroy?, update?(dt) }.
   The stack is a stack: opening the Forge from the Library and closing it
   returns you to the Library, not to the world.
*/

import { bus, EV } from '../core/Bus.js';
import { State } from '../game/State.js';
import { audio } from '../core/Audio.js';
import { input } from '../core/Input.js';
import { CFG } from '../core/Config.js';
import { commas, formatNum, esc, clamp } from '../core/Util.js';
import { MATERIALS, CURRENCIES, getMaterial, resourceIcon, resourceName } from '../data/Materials.js';
import { UNITS } from '../data/Units.js';

class UISystem {
  constructor() {
    this.root = document.getElementById('ui');
    this.toastLayer = document.getElementById('toasts');
    this.tip = document.getElementById('tooltip');
    this.stack = [];
    this.topbar = null;
    this._tipTarget = null;
    this._bumpTimers = new Map();
  }

  init() {
    this._buildTopbar();
    this._wireTooltips();

    bus.on(EV.RESOURCE_GAINED, ({ id }) => this._bump(id));
    bus.on(EV.STATE_CHANGED, () => this.refreshTopbar());
    bus.on(EV.LEVEL_UP, ({ level }) => {
      this.toast(`Commander level ${level}`, 'legend', '🎖');
      audio.play('levelup');
    });
    bus.on(EV.CARD_UNLOCKED, ({ unit }) => {
      this.toast(`New card: ${unit.name}`, unit.rarity === 'legendary' || unit.rarity === 'mythic' ? 'legend' : 'epic', '🃏');
      audio.play('unlock');
    });
    bus.on(EV.QUEST_COMPLETE, ({ quest }) => {
      this.toast(`Challenge complete — ${quest.name}`, 'good', quest.icon);
      audio.play('upgrade');
    });
    bus.on(EV.RESEARCH_DONE, ({ node }) => this.toast(`Research complete — ${node.name}`, 'good', node.icon));
    bus.on(EV.REGION_UNLOCKED, ({ region }) => {
      this.toast(`New region: ${region.name}`, 'legend', region.icon);
      audio.play('unlock');
    });
  }

  /* ====================================================================== */
  /* TOP BAR                                                                 */
  /* ====================================================================== */

  _buildTopbar() {
    const el = document.createElement('div');
    el.id = 'topbar';
    el.innerHTML = `
      <div class="brand" data-act="home">CROWNFALL</div>
      <div class="spacer"></div>
      <div class="res-group" id="res-group"></div>
      <div class="res res-lvl" data-tip="commander">
        <span class="ico">🎖</span><span class="val" id="res-level">1</span>
      </div>
      <div class="btn ghost sm" data-act="options"><span>⚙</span></div>
    `;
    this.root.appendChild(el);
    this.topbar = el;

    el.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      audio.play('ui.click');
      if (act === 'home') this.closeAll();
      if (act === 'options') this.openOptions();
    });

    this.refreshTopbar();
  }

  refreshTopbar() {
    if (!this.topbar) return;
    const s = State.s;
    if (!s) return;
    const g = this.topbar.querySelector('#res-group');
    const rows = [
      { id: 'gold', icon: '🪙', v: s.gold },
      { id: 'scroll', icon: '📜', v: s.scroll },
      { id: 'warSeal', icon: '🎖', v: s.warSeal },
    ];
    // top three materials by quantity, so the bar reflects what you actually have
    const mats = Object.entries(s.materials).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [id, n] of mats) rows.push({ id, icon: resourceIcon(id), v: n });

    g.innerHTML = rows.map(r => `
      <div class="res" data-res="${r.id}" data-tip="res:${r.id}">
        <span class="ico">${r.icon}</span><span class="val">${formatNum(r.v)}</span>
      </div>`).join('');

    this.topbar.querySelector('#res-level').textContent = s.level;
  }

  _bump(id) {
    const el = this.topbar?.querySelector(`[data-res="${id}"]`);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  showTopbar(v) { if (this.topbar) this.topbar.classList.toggle('hidden', !v); }

  /* ====================================================================== */
  /* SCREENS                                                                 */
  /* ====================================================================== */

  open(screen, args) {
    // re-opening the same screen refreshes instead of stacking duplicates
    const top = this.stack[this.stack.length - 1];
    if (top && top.screen.id === screen.id) { this.close(); }

    const el = document.createElement('div');
    el.className = 'screen';
    this.root.appendChild(el);
    const entry = { screen, el, args };
    this.stack.push(entry);
    try {
      screen.build(el, args, this);
    } catch (e) {
      console.error('[ui] screen failed to build:', screen.id, e);
      el.innerHTML = `<div class="screen-body"><div class="empty-note">Something went wrong opening this screen.</div></div>`;
    }
    audio.play('ui.open');
    bus.emit(EV.SCREEN_OPEN, { id: screen.id });
    input.blocked = true;
    return entry;
  }

  close() {
    const entry = this.stack.pop();
    if (!entry) return;
    entry.screen.destroy?.();
    entry.el.classList.add('out');
    setTimeout(() => entry.el.remove(), 240);
    audio.play('ui.back');
    bus.emit(EV.SCREEN_CLOSE, { id: entry.screen.id });
    input.blocked = this.stack.length > 0;
  }

  closeAll() {
    while (this.stack.length) this.close();
    input.blocked = false;
  }

  get current() { return this.stack[this.stack.length - 1]?.screen || null; }
  get isOpen() { return this.stack.length > 0; }

  /** Rebuild the current screen in place — used after a purchase or upgrade. */
  refresh() {
    const entry = this.stack[this.stack.length - 1];
    if (!entry) return;
    const scroll = entry.el.querySelector('.screen-body')?.scrollTop || 0;
    entry.screen.destroy?.();
    entry.el.innerHTML = '';
    try { entry.screen.build(entry.el, entry.args, this); }
    catch (e) { console.error('[ui] refresh failed', e); }
    const body = entry.el.querySelector('.screen-body');
    if (body) body.scrollTop = scroll;
  }

  update(dt) {
    for (const e of this.stack) e.screen.update?.(dt);
  }

  /* ====================================================================== */
  /* SCREEN SCAFFOLD                                                         */
  /* ====================================================================== */

  /**
   * Standard screen chrome. Returns { head, tabs, body, foot }.
   */
  scaffold(el, o = {}) {
    el.innerHTML = `
      <div class="screen-head">
        ${o.icon ? `<div style="font-size:30px">${o.icon}</div>` : ''}
        <div class="titles">
          <h1>${esc(o.title || '')}</h1>
          ${o.blurb ? `<div class="blurb">${o.blurb}</div>` : ''}
        </div>
        <div class="rowflex" id="head-extra"></div>
        <div class="btn ghost" data-close>Close <span class="kbd">ESC</span></div>
      </div>
      ${o.tabs ? '<div class="tabs" id="tabs"></div>' : ''}
      <div class="screen-body" id="body"></div>
      ${o.foot ? '<div class="screen-foot" id="foot"></div>' : ''}
    `;
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
    const parts = {
      head: el.querySelector('#head-extra'),
      tabs: el.querySelector('#tabs'),
      body: el.querySelector('#body'),
      foot: el.querySelector('#foot'),
    };
    if (o.tabs && parts.tabs) {
      parts.tabs.innerHTML = o.tabs.map((t, i) =>
        `<div class="tab${i === (o.activeTab || 0) ? ' on' : ''}" data-tab="${t.id}">${t.icon ? t.icon + ' ' : ''}${esc(t.name)}</div>`).join('');
      parts.tabs.addEventListener('click', e => {
        const id = e.target.closest('[data-tab]')?.dataset.tab;
        if (!id) return;
        audio.play('ui.click');
        o.onTab?.(id);
      });
    }
    return parts;
  }

  /* ====================================================================== */
  /* TOASTS                                                                  */
  /* ====================================================================== */

  toast(text, kind = '', icon = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `${icon ? `<span class="ti">${icon}</span>` : ''}<span>${esc(text)}</span>`;
    this.toastLayer.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, CFG.ui.toastMs);
    // never let the stack run away
    while (this.toastLayer.children.length > 5) this.toastLayer.firstChild.remove();
  }

  /* ====================================================================== */
  /* TOOLTIPS                                                                */
  /* ====================================================================== */

  _wireTooltips() {
    let timer = null;
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-tip]');
      if (!el) return;
      clearTimeout(timer);
      timer = setTimeout(() => this._showTip(el, el.dataset.tip), CFG.ui.tooltipDelay);
    });
    document.addEventListener('pointerout', e => {
      if (!e.target.closest?.('[data-tip]')) return;
      clearTimeout(timer);
      this.hideTip();
    });
    document.addEventListener('pointermove', e => {
      if (this.tip.classList.contains('hidden')) return;
      this._place(e.clientX, e.clientY);
    });
    document.addEventListener('pointerdown', () => this.hideTip());
  }

  _showTip(el, key) {
    const html = this.tipContent(key, el);
    if (!html) return;
    this.tip.innerHTML = html;
    this.tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    this._place(r.left + r.width / 2, r.top);
  }

  _place(x, y) {
    const r = this.tip.getBoundingClientRect();
    let left = x + 16, top = y + 16;
    if (left + r.width > innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > innerHeight - 8) top = y - r.height - 16;
    this.tip.style.left = Math.max(8, left) + 'px';
    this.tip.style.top = Math.max(8, top) + 'px';
  }

  hideTip() { this.tip.classList.add('hidden'); }

  /** Extensible tooltip registry — screens can add keys. */
  tipContent(key, el) {
    if (this.tipProviders) {
      for (const p of this.tipProviders) {
        const r = p(key, el);
        if (r) return r;
      }
    }
    if (key === 'commander') {
      const s = State.s;
      const st = State.commanderStats();
      return `<h4>Commander</h4><div class="tip-sub">Level ${s.level}</div>
        <div>${commas(s.xp)} / ${commas(State.xpToNext())} experience</div>
        <ul>
          <li>Health <em>${commas(st.maxHp)}</em></li>
          <li>Might <em>${st.might}</em> · Focus <em>${st.focus}</em></li>
          <li>Armour <em>${st.armor}</em> · Weight <em>${st.weight}</em></li>
          <li>Move speed <em>${st.moveSpeed.toFixed(1)}</em> m/s</li>
        </ul>`;
    }
    if (key.startsWith('res:')) {
      const id = key.slice(4);
      const m = getMaterial(id);
      if (!m) return null;
      return `<h4>${m.icon} ${esc(m.name)}</h4>
        ${m.tier ? `<div class="tip-sub">Tier ${m.tier} ${m.kind || ''}</div>` : ''}
        <div>${esc(m.desc || '')}</div>
        ${m.source ? `<div style="margin-top:6px"><em>Found:</em> ${esc(m.source)}</div>` : ''}
        <div style="margin-top:6px">You hold <em>${commas(State.count(id))}</em></div>`;
    }
    return null;
  }

  addTipProvider(fn) {
    this.tipProviders = this.tipProviders || [];
    this.tipProviders.push(fn);
  }

  /* ====================================================================== */
  /* OVERLAYS                                                                */
  /* ====================================================================== */

  overlay(html, onBuild) {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `<div class="panel box corner-frame">${html}</div>`;
    this.root.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    const close = () => { el.remove(); input.blocked = this.stack.length > 0; };
    input.blocked = true;
    onBuild?.(el, close);
    return { el, close };
  }

  confirm(title, text, onYes, yesLabel = 'Confirm') {
    return this.overlay(`
      <div class="h-rule"><h2>${esc(title)}</h2></div>
      <div class="sub" style="font-style:normal;font-size:14px;line-height:1.6">${text}</div>
      <div class="rowflex mt16" style="justify-content:flex-end">
        <div class="btn ghost" data-no>Cancel</div>
        <div class="btn gold" data-yes>${esc(yesLabel)}</div>
      </div>`, (el, close) => {
      el.querySelector('[data-no]').onclick = () => { audio.play('ui.back'); close(); };
      el.querySelector('[data-yes]').onclick = () => { audio.play('ui.click'); close(); onYes(); };
    });
  }

  openOptions() {
    const s = State.s.settings;
    this.overlay(`
      <div class="h-rule"><h2>Options</h2></div>
      <div class="optrow"><span class="k">Master volume</span><input type="range" id="o-master" min="0" max="100" value="${s.master * 100}"></div>
      <div class="optrow"><span class="k">Effects</span><input type="range" id="o-sfx" min="0" max="100" value="${s.sfx * 100}"></div>
      <div class="optrow"><span class="k">Music</span><input type="range" id="o-music" min="0" max="100" value="${s.music * 100}"></div>
      <div class="optrow"><span class="k">Look sensitivity</span><input type="range" id="o-sens" min="20" max="250" value="${Math.round((s.lookSensitivity ?? 1) * 100)}"></div>
      <div class="optrow"><span class="k">Invert vertical look</span><div class="toggle${s.invertY ? ' on' : ''}" id="o-inv"></div></div>
      <div class="optrow"><span class="k">Bloom</span><div class="toggle${s.bloom ? ' on' : ''}" id="o-bloom"></div></div>
      <div class="optrow"><span class="k">Shadows</span><div class="toggle${s.shadows ? ' on' : ''}" id="o-shadows"></div></div>
      <div class="optrow"><span class="k">Damage numbers</span><div class="toggle${s.damageNumbers ? ' on' : ''}" id="o-dmg"></div></div>
      <div class="optrow"><span class="k">Camera shake</span><div class="toggle${s.cameraShake ? ' on' : ''}" id="o-shake"></div></div>
      <div class="optrow"><span class="k">Tutorial hints</span><div class="toggle${s.tutorialHints ? ' on' : ''}" id="o-hints"></div></div>
      <div class="rowflex mt16" style="justify-content:space-between">
        <div class="btn danger sm" id="o-wipe">Delete save</div>
        <div class="btn gold" data-ok>Done</div>
      </div>
    `, (el, close) => {
      const slide = (id, key, apply) => {
        el.querySelector(id).addEventListener('input', e => {
          const v = e.target.value / 100;
          State.setSetting(key, v);
          apply(v);
        });
      };
      slide('#o-master', 'master', v => audio.setVolume('master', v));
      slide('#o-sfx', 'sfx', v => audio.setVolume('sfx', v));
      slide('#o-music', 'music', v => audio.setVolume('music', v));
      el.querySelector('#o-sens').addEventListener('input', e => {
        const v = Math.max(0.2, e.target.value / 100);
        State.setSetting('lookSensitivity', v);
        this.onSetting?.('lookSensitivity', v);
      });

      const tog = (id, key, apply) => {
        const t = el.querySelector(id);
        t.addEventListener('click', () => {
          const v = !t.classList.contains('on');
          t.classList.toggle('on', v);
          State.setSetting(key, v);
          apply?.(v);
          audio.play('ui.click');
        });
      };
      tog('#o-inv', 'invertY', v => this.onSetting?.('invertY', v));
      tog('#o-bloom', 'bloom', v => this.onSetting?.('bloom', v));
      tog('#o-shadows', 'shadows', v => this.onSetting?.('shadows', v));
      tog('#o-dmg', 'damageNumbers');
      tog('#o-shake', 'cameraShake');
      tog('#o-hints', 'tutorialHints');

      el.querySelector('#o-wipe').onclick = () => {
        close();
        this.confirm('Delete save?', 'This erases your commander, your collection and all progress. It cannot be undone.',
          () => { State.reset(); location.reload(); }, 'Delete everything');
      };
      el.querySelector('[data-ok]').onclick = () => { audio.play('ui.click'); close(); };
    });
  }

  /* --------------------------------------------------------------- misc */

  callout(big, small, ms = 1600) {
    const el = document.createElement('div');
    el.className = 'callout';
    el.innerHTML = `<div class="big">${esc(big)}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}`;
    this.root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }, ms);
    return el;
  }
}

export const UI = new UISystem();
