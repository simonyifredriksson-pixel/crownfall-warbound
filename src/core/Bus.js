/* Bus.js — a tiny synchronous event bus.
   Systems talk through this instead of reaching into each other, which is what
   keeps cards/battle/UI/save separable. */

class EventBus {
  constructor() { this.map = new Map(); this.anyFns = []; }

  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, []);
    this.map.get(evt).push(fn);
    return () => this.off(evt, fn);
  }

  once(evt, fn) {
    const un = this.on(evt, (...a) => { un(); fn(...a); });
    return un;
  }

  off(evt, fn) {
    const list = this.map.get(evt);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  /** Listen to everything — used by the debug overlay and the quest tracker. */
  onAny(fn) { this.anyFns.push(fn); return () => { const i = this.anyFns.indexOf(fn); if (i >= 0) this.anyFns.splice(i, 1); }; }

  emit(evt, payload) {
    const list = this.map.get(evt);
    if (list) {
      // copy: handlers may unsubscribe during dispatch
      for (const fn of list.slice()) {
        try { fn(payload); }
        catch (e) { console.error('[bus] handler failed for "' + evt + '"', e); }
      }
    }
    for (const fn of this.anyFns.slice()) {
      try { fn(evt, payload); } catch (e) { console.error('[bus] any-handler failed', e); }
    }
  }

  clear(evt) { if (evt) this.map.delete(evt); else { this.map.clear(); this.anyFns.length = 0; } }
}

export const bus = new EventBus();

/** Canonical event names. Keeping them in one object stops typo-bugs. */
export const EV = {
  // meta
  SAVE_LOADED: 'save:loaded',
  SAVE_WRITTEN: 'save:written',
  STATE_CHANGED: 'state:changed',       // any resource/progress mutation
  RESOURCE_GAINED: 'res:gained',        // {id, n}
  TOAST: 'ui:toast',
  SCREEN_OPEN: 'ui:screen-open',
  SCREEN_CLOSE: 'ui:screen-close',

  // progression
  LEVEL_UP: 'prog:levelup',
  CARD_UNLOCKED: 'card:unlocked',
  CARD_UPGRADED: 'card:upgraded',
  CARD_AWAKENED: 'card:awakened',
  ITEM_CRAFTED: 'item:crafted',
  ITEM_EQUIPPED: 'item:equipped',
  RESEARCH_DONE: 'research:done',
  RECIPE_LEARNED: 'recipe:learned',
  NODE_CLEARED: 'map:node-cleared',
  REGION_UNLOCKED: 'map:region-unlocked',
  QUEST_PROGRESS: 'quest:progress',
  QUEST_COMPLETE: 'quest:complete',

  // battle
  BATTLE_START: 'battle:start',
  BATTLE_END: 'battle:end',
  UNIT_SPAWNED: 'battle:unit-spawned',
  UNIT_DIED: 'battle:unit-died',
  DAMAGE_DEALT: 'battle:damage',
  STRUCTURE_DESTROYED: 'battle:structure-down',
  POINT_CAPTURED: 'battle:point-captured',
  ABILITY_USED: 'battle:ability',
  SYNERGY_ACTIVE: 'battle:synergy',
  BOSS_PHASE: 'battle:boss-phase',
  COMMANDER_DOWN: 'battle:commander-down',
  WAVE_START: 'battle:wave-start',
  WAVE_CLEAR: 'battle:wave-clear',
  UNIT_DEPLOYED: 'battle:unit-deployed',    // the PLAYER placed a card

  // onboarding
  TUTORIAL_STEP: 'tut:step',
  TUTORIAL_DONE: 'tut:done',

  // world
  ZONE_ENTER: 'world:zone-enter',
  NPC_TALK: 'world:npc-talk',
};
