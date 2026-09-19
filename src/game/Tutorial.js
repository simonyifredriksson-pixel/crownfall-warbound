/* Tutorial.js — the onboarding state machine.

   It walks `TUTORIAL` one step at a time. For each step it:
     1. puts the objective in the corner,
     2. raises a beacon or pulses a button so "go to the Forge" means
        something,
     3. has the Marshal say her line — in the normal dialogue box every other
        NPC uses, so the tutorial is part of the world rather than a layer
        bolted on top,
     4. waits for the bus event the step declares.

   It never blocks input, never takes the camera, and never forces a popup in
   front of a fight. If the player ignores it entirely the game still works;
   the objective panel just keeps quietly saying what would help.

   Progress is saved, so closing the tab mid-tutorial resumes where you were.
*/

import { bus, EV } from '../core/Bus.js';
import { State } from './State.js';
import { Objective } from '../ui/Objective.js';
import { TUTORIAL, TUTORIAL_OUTRO } from '../data/TutorialScript.js';
import { NPCS } from '../data/Dialogue.js';
import { openDialogue, dialogueOpen } from '../world/NPCs.js';

class TutorialSystem {
  constructor() {
    this.wired = false;
    this.pending = null;      // a `say` waiting for a quiet moment
    this.sayT = 0;
  }

  /* ---------------------------------------------------------------- state */

  get rec() {
    const s = State.s;
    if (!s.tutorial) s.tutorial = { step: 0, done: false, said: [] };
    if (!s.tutorial.said) s.tutorial.said = [];
    return s.tutorial;
  }

  get step() { return this.rec.done ? null : TUTORIAL[this.rec.step] || null; }
  get active() { return !this.rec.done && this.rec.step < TUTORIAL.length; }

  /** Skip the whole thing — offered on the first screen and in Options. */
  skip() {
    this.rec.done = true;
    this.rec.step = TUTORIAL.length;
    State.mark();
    Objective.clear();
    bus.emit(EV.TUTORIAL_DONE, { skipped: true });
  }

  /* ----------------------------------------------------------------- wire */

  init() {
    if (this.wired) return;
    this.wired = true;

    // One listener per distinct event the script mentions. Adding a step with
    // a new trigger event needs no code here.
    const evts = new Set(TUTORIAL.map(s => s.done?.evt).filter(Boolean));
    for (const evt of evts) {
      bus.on(evt, (payload) => this._maybeAdvance(evt, payload || {}));
    }

    this.refresh();
  }

  _maybeAdvance(evt, payload) {
    const st = this.step;
    if (!st || !st.done || st.done.evt !== evt) return;
    try {
      if (st.done.test && !st.done.test(payload)) return;
    } catch (e) { return; }

    if (st.grant) State.grant(st.grant, 'tutorial');
    this.rec.step++;
    State.mark();
    bus.emit(EV.TUTORIAL_STEP, { id: st.id, index: this.rec.step });

    if (this.rec.step >= TUTORIAL.length) {
      this.rec.done = true;
      State.mark();
      Objective.clear();
      this.pending = { lines: TUTORIAL_OUTRO, force: true };
      bus.emit(EV.TUTORIAL_DONE, { skipped: false });
      return;
    }
    this.refresh();
  }

  /** Re-post the current objective. Call after a zone change or a reload. */
  refresh() {
    const st = this.step;
    if (!st) { Objective.clear(); return; }

    Objective.set({
      title: st.objective,
      hint: st.hint,
      step: this.rec.step + 1,
      total: TUTORIAL.length,
      beckon: st.beckon,
      at: st.at && st.at.zone === (this.zoneId || 'keep') ? st.at : null,
    });

    // queue the spoken line; `update` finds a moment when nothing else is open
    if (st.say && !this.rec.said.includes(st.id)) {
      this.pending = { lines: st.say, id: st.id };
    }
  }

  /** The hub tells us where the player is, so world beacons are zone-correct. */
  setZone(id) {
    this.zoneId = id;
    if (this.active) this.refresh();
  }

  /* --------------------------------------------------------------- speech */

  update(dt, ctx = {}) {
    if (!this.pending) return;
    // never talk over a menu, a fight's opening seconds, or another NPC
    if (ctx.uiOpen || dialogueOpen()) return;
    this.sayT += dt;
    if (this.sayT < (ctx.delay ?? 0.9)) return;

    const p = this.pending;
    this.pending = null;
    this.sayT = 0;
    if (p.id && !this.rec.said.includes(p.id)) { this.rec.said.push(p.id); State.mark(); }
    this.say(p.lines);
  }

  /** The Marshal, in the same dialogue box as every other character. */
  say(lines) {
    const def = NPCS.marshal;
    if (!def) return;
    const text = (Array.isArray(lines) ? lines : [lines]).join('\n\n');
    openDialogue(def, { root: { text, opts: [{ label: 'Understood' }] } }, 'root', null);
  }

  /** Repeat the current step's line — the objective panel's "say again". */
  repeat() {
    const st = this.step;
    if (st?.say) this.say(st.say);
  }
}

export const Tutorial = new TutorialSystem();
