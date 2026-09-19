/* ScreenArmy.js — the army camp: your deck, your collection, your challenges.

   The deck screen is where strategy is actually authored, so it does three
   things beyond letting you drag cards around:
     - shows your active DECK SYNERGIES and what is one card away
     - shows the composition meter, so a deck with no frontline is obvious
     - shows average Command cost, the single most common deckbuilding mistake
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { cardEl, miniCardEl, emptySlotEl, cardDetail, compositionMeter, section, empty, filterBar, button } from './Widgets.js';
import { UNITS, COLLECTIBLE, ROLE_INFO } from '../data/Units.js';
import { RARITY, RARITY_ORDER, CFG } from '../core/Config.js';
import { DECK_SYNERGIES, activeDeckSynergies, SYNERGIES } from '../data/Synergies.js';
import { QUEST_LIST, QUESTS } from '../data/Quests.js';
import { audio } from '../core/Audio.js';
import { esc, commas, formatNum, clamp } from '../core/Util.js';
import { Thumbs } from './Thumbs.js';

let tab = 'deck';
let filter = 'all';
let search = '';
let selected = null;

export const ScreenArmy = {
  id: 'army',

  build(el, args, ui) {
    if (args?.tab) tab = args.tab;
    const parts = ui.scaffold(el, {
      icon: '🚩',
      title: 'The Army',
      blurb: 'Eight cards go to war. Choose them like you mean it.',
      tabs: [
        { id: 'deck', name: 'Army', icon: '🚩' },
        { id: 'collection', name: 'Collection', icon: '🃏' },
        { id: 'challenges', name: 'Challenges', icon: '🎖' },
      ],
      activeTab: ['deck', 'collection', 'challenges'].indexOf(tab),
      onTab: (id) => { tab = id; ui.refresh(); },
    });

    if (tab === 'deck') buildDeck(parts.body, ui);
    else if (tab === 'collection') buildCollection(parts.body, ui);
    else buildChallenges(parts.body, ui);
  },
};

/* ==========================================================================
   DECK
   ========================================================================== */

function buildDeck(body, ui) {
  const s = State.s;
  const wrap = document.createElement('div');
  wrap.className = 'two-col';
  body.appendChild(wrap);

  const left = document.createElement('div');
  const right = document.createElement('div');
  wrap.append(left, right);

  /* ------------------------------------------------------- deck slots */
  left.appendChild(section('Your Army', `${s.deck.length} of ${CFG.battle.deckSize} slots filled. Click a slot to remove it, then pick a replacement below.`));

  const slots = document.createElement('div');
  slots.className = 'rowflex gap6 mb10';
  slots.style.flexWrap = 'wrap';
  for (let i = 0; i < CFG.battle.deckSize; i++) {
    const id = s.deck[i];
    if (id) {
      slots.appendChild(miniCardEl(id, s.cards[id]?.level || 1, (uid) => {
        const d = s.deck.slice();
        d.splice(i, 1);
        State.setDeck(d);
        audio.play('ui.back');
        ui.refresh();
      }));
    } else {
      slots.appendChild(emptySlotEl(() => { tab = 'collection'; ui.refresh(); }));
    }
  }
  left.appendChild(slots);

  /* --------------------------------------------------------- analysis */
  const units = State.deckUnits();
  const avg = State.deckAvgCost();
  const analysis = document.createElement('div');
  analysis.className = 'panel';
  analysis.style.padding = '13px 15px';
  analysis.innerHTML = `
    <div class="rowflex" style="justify-content:space-between;align-items:flex-start">
      <div class="avgcost">Average cost <span class="n">${avg.toFixed(2)}</span></div>
      <div class="sub" style="max-width:280px;text-align:right">${costAdvice(avg, units)}</div>
    </div>
    <div class="mt10">${compositionMeter(units)}</div>
    <div class="mt10">${gapAdvice(units)}</div>
  `;
  left.appendChild(analysis);

  /* -------------------------------------------------------- synergies */
  const active = activeDeckSynergies(units);
  const synBox = document.createElement('div');
  synBox.className = 'mt16';
  synBox.appendChild(section('Synergies', 'Deck synergies apply the moment the battle starts. Field synergies depend on where you actually put your units.'));

  if (active.length) {
    for (const syn of active) {
      const row = document.createElement('div');
      row.className = 'recipe';
      row.style.setProperty('--rc', 'var(--gold)');
      row.innerHTML = `
        <div class="ric">${syn.icon}</div>
        <div>
          <div class="rn" style="color:var(--gold-hi)">${esc(syn.name)}</div>
          <div class="rd">${syn.desc}</div>
          <div class="small muted" style="font-style:italic">${syn.detail}</div>
        </div>
        <div class="chip on">Active</div>`;
      synBox.appendChild(row);
    }
  } else {
    synBox.appendChild(empty('No deck synergies active. Look at what is one card away, below.'));
  }

  // near misses: synergies you would activate with one more card
  const near = DECK_SYNERGIES.filter(syn => !active.includes(syn) && nearlyActive(syn, units));
  if (near.length) {
    const h = document.createElement('div');
    h.className = 'sub mt10';
    h.innerHTML = '<b>One card away:</b>';
    synBox.appendChild(h);
    for (const syn of near) {
      const row = document.createElement('div');
      row.className = 'recipe undisc';
      row.innerHTML = `
        <div class="ric">${syn.icon}</div>
        <div>
          <div class="rn">${esc(syn.name)}</div>
          <div class="rd">${syn.desc}</div>
        </div>
        <div class="chip">Close</div>`;
      synBox.appendChild(row);
    }
  }
  left.appendChild(synBox);

  /* ---------------------------------------------- right: quick swap list */
  right.appendChild(section('Bench', 'Cards you own that are not in the army.'));
  const bench = document.createElement('div');
  bench.className = 'card-grid';
  bench.style.gridTemplateColumns = 'repeat(auto-fill,minmax(118px,1fr))';
  const owned = State.ownedCards()
    .filter(c => !s.deck.includes(c.id))
    .sort((a, b) => RARITY[b.unit.rarity].order - RARITY[a.unit.rarity].order || b.save.level - a.save.level);

  if (!owned.length) bench.appendChild(empty('Every card you own is in the army.'));
  for (const c of owned) {
    bench.appendChild(cardEl({
      unitId: c.id, level: c.save.level, shards: c.save.shards,
      onClick: (id) => {
        if (s.deck.length >= CFG.battle.deckSize) { UI.toast('Your army is full — remove a card first', 'bad'); audio.play('ui.deny'); return; }
        State.setDeck([...s.deck, id]);
        audio.play('ui.click');
        ui.refresh();
      },
    }));
  }
  right.appendChild(bench);
}

function costAdvice(avg, units) {
  if (!units.length) return 'Add cards to see advice.';
  if (avg < 3.0) return 'Very cheap. You will always have something to play — but a single big unit may walk through you.';
  if (avg < 3.8) return 'A healthy curve. You can react quickly and still afford a real push.';
  if (avg < 4.6) return 'Expensive. Make sure you have at least two cards under 3 Command so you are never caught with nothing to play.';
  return 'Far too expensive. You will spend the first minute of every battle watching.';
}

function gapAdvice(units) {
  if (!units.length) return '';
  const has = (fn) => units.some(fn);
  const gaps = [];
  if (!has(u => u.role === 'guardian' || (u.role === 'melee' && u.mass >= 2))) gaps.push('nothing that can <b>hold a line</b>');
  if (!has(u => u.range > 8)) gaps.push('no <b>ranged damage</b>');
  if (!has(u => u.splash || u.role === 'caster' || (u.count || 1) >= 3)) gaps.push('no answer to a <b>swarm</b>');
  if (!has(u => u.tags?.includes('antilarge') || u.dmgType === 'blunt')) gaps.push('no answer to <b>heavy armour</b>');
  if (!has(u => u.cost <= 3)) gaps.push('nothing <b>cheap</b> to react with');
  const types = new Set(units.map(u => u.dmgType));
  if (types.size < 3) gaps.push('only <b>' + types.size + ' damage type' + (types.size === 1 ? '' : 's') + '</b> — some enemies armour against exactly that');

  if (!gaps.length) return '<div class="chip on" style="font-size:12.5px">✓ No obvious gaps — this is a complete army.</div>';
  return `<div class="sub" style="font-style:normal"><b style="color:var(--blood-hi)">Gaps:</b> ${gaps.join(' · ')}</div>`;
}

function nearlyActive(syn, units) {
  // crude but useful: does adding any single owned card activate it?
  for (const c of State.ownedCards()) {
    if (units.some(u => u.id === c.id)) continue;
    try { if (syn.check([...units, c.unit])) return true; } catch (e) { /* ignore */ }
  }
  return false;
}

/* ==========================================================================
   COLLECTION
   ========================================================================== */

function buildCollection(body, ui) {
  const s = State.s;
  const wrap = document.createElement('div');
  wrap.className = 'two-col';
  body.appendChild(wrap);
  const left = document.createElement('div');
  const right = document.createElement('div');
  wrap.append(left, right);

  const chips = [
    { id: 'all', name: 'All', on: filter === 'all' },
    { id: 'owned', name: 'Owned', on: filter === 'owned' },
    { id: 'upgradable', name: 'Ready', icon: '▲', on: filter === 'upgradable' },
    ...RARITY_ORDER.map(r => ({ id: r, name: RARITY[r].name, on: filter === r })),
    ...Object.keys(ROLE_INFO).map(r => ({ id: 'role:' + r, name: ROLE_INFO[r].name, icon: ROLE_INFO[r].icon, on: filter === 'role:' + r })),
  ];

  left.appendChild(filterBar({
    chips, search: true,
    onFilter: id => { filter = id; ui.refresh(); },
    onSearch: v => { search = v; renderGrid(); },
  }));

  const ownedCount = Object.keys(s.cards).length;
  const stat = document.createElement('div');
  stat.className = 'sub mb10';
  stat.innerHTML = `<b>${ownedCount}</b> of <b>${COLLECTIBLE.length}</b> cards discovered.`;
  left.appendChild(stat);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  left.appendChild(grid);

  const detailHost = document.createElement('div');
  right.appendChild(detailHost);

  function showDetail(id) {
    selected = id;
    detailHost.innerHTML = '';
    detailHost.appendChild(cardDetail(id, { onChange: () => { ui.refresh(); } }));
  }

  function renderGrid() {
    grid.innerHTML = '';
    let list = COLLECTIBLE.slice();
    if (filter === 'owned') list = list.filter(u => s.cards[u.id]);
    else if (filter === 'upgradable') list = list.filter(u => State.canUpgradeCard(u.id));
    else if (RARITY_ORDER.includes(filter)) list = list.filter(u => u.rarity === filter);
    else if (filter.startsWith('role:')) list = list.filter(u => u.role === filter.slice(5));
    if (search) list = list.filter(u => u.name.toLowerCase().includes(search) || u.tags.join(' ').includes(search));

    list.sort((a, b) => {
      const oa = s.cards[a.id] ? 0 : 1, ob = s.cards[b.id] ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return RARITY[a.rarity].order - RARITY[b.rarity].order || a.cost - b.cost;
    });

    if (!list.length) { grid.appendChild(empty('Nothing matches that filter.')); return; }

    for (const u of list) {
      const save = s.cards[u.id];
      grid.appendChild(cardEl({
        unitId: u.id, level: save?.level || 1, shards: save?.shards,
        owned: !!save, selected: selected === u.id,
        onClick: (id) => { audio.play('ui.click'); showDetail(id); renderGrid(); },
      }));
    }
  }

  renderGrid();
  showDetail(selected && UNITS[selected] ? selected : (s.deck[0] || COLLECTIBLE[0].id));
}

/* ==========================================================================
   CHALLENGES
   ========================================================================== */

function buildChallenges(body, ui) {
  const s = State.s;
  const chapter = State.chaptersCleared();
  body.appendChild(section('Challenges', 'Long-term objectives. Rewards are paid the moment you complete one.'));

  const list = QUEST_LIST.filter(q => q.chapter <= chapter + 1);
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(300px,1fr))';

  const sorted = list.sort((a, b) => {
    const ra = s.quests[a.id], rb = s.quests[b.id];
    const da = ra?.done && !ra?.claimed ? 0 : ra?.claimed ? 2 : 1;
    const db = rb?.done && !rb?.claimed ? 0 : rb?.claimed ? 2 : 1;
    return da - db || a.chapter - b.chapter;
  });

  for (const q of sorted) {
    const rec = s.quests[q.id] || { n: 0, done: false, claimed: false };
    const pct = clamp(rec.n / q.target, 0, 1);
    const row = document.createElement('div');
    row.className = 'recipe' + (rec.claimed ? ' undisc' : '');
    row.innerHTML = `
      <div class="ric">${q.icon}</div>
      <div>
        <div class="rn">${esc(q.name)}${q.repeatable ? ' <span class="tag">repeatable</span>' : ''}</div>
        <div class="rd">${q.desc}</div>
        <div class="xptrack" style="height:6px"><i style="width:${(pct * 100).toFixed(0)}%"></i></div>
        <div class="small muted mt10" style="margin-top:4px">${formatNum(Math.min(rec.n, q.target))} / ${formatNum(q.target)}</div>
        <div class="matlist mt10">${rewardList(q.reward)}</div>
      </div>
      <div class="chip${rec.claimed ? '' : rec.done ? ' on' : ''}">${rec.claimed ? 'Done' : rec.done ? 'Complete' : `${Math.round(pct * 100)}%`}</div>`;
    grid.appendChild(row);
  }
  body.appendChild(grid);
}

function rewardList(r) {
  const out = [];
  if (r.gold) out.push(`<span class="mat">🪙 ${formatNum(r.gold)}</span>`);
  if (r.xp) out.push(`<span class="mat">✦ ${formatNum(r.xp)} xp</span>`);
  if (r.scroll) out.push(`<span class="mat">📜 ${r.scroll}</span>`);
  if (r.warSeal) out.push(`<span class="mat">🎖 ${r.warSeal}</span>`);
  for (const k in (r.mats || {})) out.push(`<span class="mat">${k} ×${r.mats[k]}</span>`);
  for (const k in (typeof r.shards === 'object' ? r.shards : {})) out.push(`<span class="mat">🔷 ${UNITS[k]?.name || k} ×${r.shards[k]}</span>`);
  for (const c of (r.cards || [])) out.push(`<span class="mat">🃏 ${UNITS[c]?.name || c}</span>`);
  return out.join('');
}
