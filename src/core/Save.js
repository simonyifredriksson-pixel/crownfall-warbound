/* Save.js — persistence.
   The whole profile is one JSON blob in localStorage. Writes are debounced so
   that spamming the upgrade button does not hammer storage, and every load runs
   through `migrate()` so old saves survive content patches. */

import { CFG } from './Config.js';
import { bus, EV } from './Bus.js';

const KEY = CFG.save.key;
const SCHEMA = 4;

let dirty = false;
let lastWrite = 0;
let cached = null;

export const Save = {

  /** Read the profile, or null when there is no save yet. */
  load() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { console.warn('[save] storage unavailable', e); return null; }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); }
    catch (e) {
      console.error('[save] corrupt save, backing it up and starting fresh', e);
      try { localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (_) { /* nothing we can do */ }
      return null;
    }
    data = migrate(data);
    cached = data;
    bus.emit(EV.SAVE_LOADED, data);
    return data;
  },

  /** Queue a write; the loop flushes it. */
  mark() { dirty = true; },

  /** Write immediately. */
  write(state) {
    if (!state) return false;
    const blob = { schema: SCHEMA, savedAt: Date.now(), state };
    try {
      localStorage.setItem(KEY, JSON.stringify(blob));
      cached = blob;
      dirty = false;
      lastWrite = performance.now();
      bus.emit(EV.SAVE_WRITTEN, blob);
      return true;
    } catch (e) {
      console.error('[save] write failed', e);
      return false;
    }
  },

  /** Called every frame; writes at most once per autosave interval. */
  tick(state) {
    if (!dirty) return;
    if (performance.now() - lastWrite < CFG.save.autosaveSec * 1000) return;
    this.write(state);
  },

  exists() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  },

  wipe() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    cached = null; dirty = false;
  },

  /** Export/import so a player can move a profile between browsers. */
  exportString(state) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify({ schema: SCHEMA, state })))); }
    catch (e) { return ''; }
  },
  importString(str) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      if (!data || !data.state) return null;
      return migrate(data);
    } catch (e) { return null; }
  },

  get savedAt() { return cached ? cached.savedAt : 0; },
};

/* ------------------------------------------------------------ migration */

/**
 * Bring an old blob up to the current schema. Each step is additive; we never
 * delete player-owned things, only fill in fields new content expects.
 */
function migrate(blob) {
  if (!blob.state) blob = { schema: 0, state: blob };
  const s = blob.state;
  const from = blob.schema || 0;

  if (from < 2) {
    s.research = s.research || [];
    s.recipes = s.recipes || [];
    s.quests = s.quests || {};
  }
  if (from < 3) {
    s.codex = s.codex || { units: [], factions: [], lore: [] };
    s.stats = s.stats || {};
  }
  if (from < 4) {
    s.potions = s.potions || {};
    s.loadout = s.loadout || {};
    s.settings = s.settings || {};
  }

  // Defensive defaults — a field added by new content should never crash a load.
  s.gold ??= 0;
  s.materials ??= {};
  s.shards ??= {};
  s.cards ??= {};
  s.items ??= [];
  s.equipped ??= {};
  s.deck ??= [];
  s.level ??= 1;
  s.xp ??= 0;
  s.progress ??= { regions: {}, nodes: {} };
  s.flags ??= {};

  blob.schema = SCHEMA;
  return blob;
}
