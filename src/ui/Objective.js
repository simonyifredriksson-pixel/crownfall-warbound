/* Objective.js — "what am I supposed to be doing?", answered permanently.

   One small panel, always in the same corner, in the hub AND in battle. It is
   deliberately quiet: a label, one imperative line, one line of where-to-go,
   and nothing else. It collapses to a single strip if the player wants it out
   of the way, and it remembers that choice.

   It also owns the two pointers that go with an objective:
     BECKON   a pulsing ring on the nav-dock button you are being sent to
     COMPASS  an arrow at the edge of the screen pointing at a world target
              that is currently off-camera

   Those two are why the panel works. Telling someone to "visit the Forge" is
   useless if they cannot see which door that is.
*/

import { ic } from '../art/Icons.js';
import { esc } from '../core/Util.js';

class ObjectiveHud {
  constructor() {
    this.el = null;
    this.cur = null;
    this.target = null;      // { x, z, label } in hub-world space
    this.collapsed = false;
    this.arrow = null;
  }

  _ensure() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'objective hidden';
    el.innerHTML = `
      <div class="obj-bar">
        <span class="obj-cap">${ic('quest')} Current objective</span>
        <span class="obj-fold" data-fold></span>
      </div>
      <div class="obj-main">
        <div class="obj-title" data-title></div>
        <div class="obj-hint" data-hint></div>
        <div class="obj-step" data-step></div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    this.el = el;
    this._t = el.querySelector('[data-title]');
    this._h = el.querySelector('[data-hint]');
    this._s = el.querySelector('[data-step]');
    el.querySelector('[data-fold]').addEventListener('click', () => this.toggle());
    el.querySelector('.obj-bar').addEventListener('click', e => {
      if (!e.target.closest('[data-fold]')) this.toggle();
    });
    this._paintFold();

    const a = document.createElement('div');
    a.className = 'obj-compass hidden';
    a.innerHTML = `<span class="oc-arrow">${ic('chevron')}</span><span class="oc-label"></span>`;
    document.getElementById('ui').appendChild(a);
    this.arrow = a;
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this._paintFold();
  }

  _paintFold() {
    if (!this.el) return;
    this.el.classList.toggle('folded', this.collapsed);
    this.el.querySelector('[data-fold]').innerHTML = ic(this.collapsed ? 'chevron' : 'close');
  }

  /**
   * @param o { title, hint, step, total, beckon, at }
   *          `at` is a world point in the CURRENT zone; `beckon` is a dock id
   */
  set(o) {
    this._ensure();
    const changed = !this.cur || this.cur.title !== o.title;
    this.cur = o;

    this._t.innerHTML = esc(o.title || '');
    this._h.innerHTML = o.hint ? esc(o.hint) : '';
    this._h.classList.toggle('hidden', !o.hint);
    this._s.textContent = (o.step && o.total) ? `Step ${o.step} of ${o.total}` : '';
    this.el.classList.remove('hidden');

    if (changed) {
      // a one-shot flash, not a permanent animation: an objective panel that
      // pulses forever is the definition of annoying
      this.el.classList.remove('pop');
      void this.el.offsetWidth;
      this.el.classList.add('pop');
    }

    this.setBeckon(o.beckon || null);
    this.target = o.at || null;
  }

  clear() {
    this.cur = null;
    this.target = null;
    this.setBeckon(null);
    if (this.el) this.el.classList.add('hidden');
    if (this.arrow) this.arrow.classList.add('hidden');
  }

  /** Pulse one nav-dock button, and only one. */
  setBeckon(id) {
    for (const b of document.querySelectorAll('.dockbtn.beckon')) b.classList.remove('beckon');
    if (!id) return;
    const b = document.querySelector(`.dockbtn[data-go="${id}"]`);
    if (b) b.classList.add('beckon');
  }

  /**
   * Point at the current world target. Called every hub frame.
   * When the target is on screen the arrow hides — an arrow pointing at
   * something you can already see is noise.
   */
  updateCompass(camera, THREE) {
    if (!this.arrow) return;
    const t = this.target;
    if (!t) { this.arrow.classList.add('hidden'); return; }

    const v = new THREE.Vector3(t.x, 1.4, t.z).project(camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 0.86 && Math.abs(v.y) < 0.82;
    if (onScreen) { this.arrow.classList.add('hidden'); return; }

    // behind the camera projects mirrored; flip it back so the arrow points
    // the way the player must actually turn
    let x = v.x, y = v.y;
    if (v.z > 1) { x = -x; y = -y; }

    const len = Math.hypot(x, y) || 1;
    const nx = x / len, ny = y / len;
    const rx = innerWidth * 0.5 + nx * innerWidth * 0.36;
    const ry = innerHeight * 0.5 - ny * innerHeight * 0.32;

    this.arrow.classList.remove('hidden');
    this.arrow.style.left = rx + 'px';
    this.arrow.style.top = ry + 'px';
    this.arrow.querySelector('.oc-arrow').style.transform =
      `rotate(${Math.atan2(-ny, nx) * 180 / Math.PI + 90}deg)`;
    this.arrow.querySelector('.oc-label').textContent = t.label || '';
  }

  destroy() {
    this.el?.remove(); this.el = null;
    this.arrow?.remove(); this.arrow = null;
  }
}

export const Objective = new ObjectiveHud();
