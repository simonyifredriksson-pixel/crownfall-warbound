/* ScreenLibrary.js — the Wizard's working interface.

   Card upgrading, research, brewing, awakening and the codex. These are the
   Library's *tools*; the Library itself is a place you walk around in
   (world/Zones.js), and the Wizard's personality lives in Dialogue.js.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { cardEl, cardDetail, costList, section, empty, filterBar, counterMatrix } from './Widgets.js';
import { UNITS, COLLECTIBLE, ROLE_INFO } from '../data/Units.js';
import { RARITY, RARITY_ORDER, CFG } from '../core/Config.js';
import { RESEARCH, RESEARCH_LIST, BRANCHES, researchAvailable } from '../data/Research.js';
import { RECIPES, recipesFor, isDiscovered } from '../data/Recipes.js';
import { POTIONS, ITEMS } from '../data/Items.js';
import { FACTIONS, FACTION_LIST } from '../data/Factions.js';
import { SYNERGIES, COMBO_SYNERGIES, FIELD_SYNERGIES, DECK_SYNERGIES } from '../data/Synergies.js';
import { STATUS } from '../data/Statuses.js';
import { ABILITIES } from '../data/Abilities.js';
import { MATERIALS } from '../data/Materials.js';
import { audio } from '../core/Audio.js';
import { esc, commas, formatNum, clamp } from '../core/Util.js';
import { Thumbs } from './Thumbs.js';
import { ic } from '../art/Icons.js';

let tab = 'upgrade';
let selected = null;
let codexTab = 'factions';

export const ScreenLibrary = {
  id: 'library',

  build(el, args, ui) {
    if (args?.tab) tab = args.tab;
    const canBrew = State.s.research.includes('alchemy1');
    const canAwaken = State.bonuses.awakeningUnlocked;

    const tabs = [
      { id: 'upgrade', name: 'Card Study', icon: ic('crystal') },
      { id: 'research', name: 'Research', icon: ic('scroll') },
    ];
    if (canBrew) tabs.push({ id: 'alchemy', name: 'Brewing', icon: ic('flask') });
    if (canAwaken) tabs.push({ id: 'awaken', name: 'Awakening', icon: ic('star') });
    tabs.push({ id: 'codex', name: 'Codex', icon: ic('book') });

    if (!tabs.some(t => t.id === tab)) tab = 'upgrade';

    const parts = ui.scaffold(el, {
      icon: ic('mage'),
      title: "The Wizard's Library",
      blurb: 'Four hundred and eleven years of notes, most of them relevant.',
      tabs, activeTab: tabs.findIndex(t => t.id === tab),
      onTab: id => { tab = id; ui.refresh(); },
    });

    const head = parts.head;
    head.innerHTML = `<div class="kv"><span class="k">Scrolls</span><span class="v">${ic('scroll')} ${State.s.scroll}</span></div>`;

    if (tab === 'upgrade') buildUpgrade(parts.body, ui);
    else if (tab === 'research') buildResearch(parts.body, ui);
    else if (tab === 'alchemy') buildAlchemy(parts.body, ui);
    else if (tab === 'awaken') buildAwaken(parts.body, ui);
    else buildCodex(parts.body, ui);
  },
};

/* ==========================================================================
   CARD STUDY
   ========================================================================== */

function buildUpgrade(body, ui) {
  const wrap = document.createElement('div');
  wrap.className = 'two-col';
  body.appendChild(wrap);
  const left = document.createElement('div'), right = document.createElement('div');
  wrap.append(left, right);

  const ready = State.ownedCards().filter(c => State.canUpgradeCard(c.id));
  left.appendChild(section('Card Study',
    ready.length
      ? `<b style="color:#7ee08a">${ready.length}</b> card${ready.length > 1 ? 's are' : ' is'} ready to upgrade right now.`
      : 'Upgrading costs shards of that specific card, plus gold. Shards come from battles, chests and the marketplace.'));

  if (ready.length > 1) {
    const btn = document.createElement('div');
    btn.className = 'btn gold mb10';
    btn.textContent = `Upgrade all ready (${ready.length})`;
    btn.onclick = () => {
      let n = 0;
      // upgrade cheapest first so the gold goes furthest
      const sorted = ready.slice().sort((a, b) => State.upgradeCost(a.id).gold - State.upgradeCost(b.id).gold);
      for (const c of sorted) {
        if (!State.canUpgradeCard(c.id)) continue;
        if (State.upgradeCard(c.id)) { Thumbs.invalidate(c.id); n++; }
      }
      audio.play('upgrade');
      UI.toast(`${n} card${n === 1 ? '' : 's'} upgraded`, 'good', ic('chevron'));
      ui.refresh();
    };
    left.appendChild(btn);
  }

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  left.appendChild(grid);

  const owned = State.ownedCards().sort((a, b) => {
    const ra = State.canUpgradeCard(a.id) ? 0 : 1, rb = State.canUpgradeCard(b.id) ? 0 : 1;
    return ra - rb || b.save.level - a.save.level;
  });
  if (!owned.length) grid.appendChild(empty('You own no cards yet.'));

  const detailHost = document.createElement('div');
  right.appendChild(detailHost);
  const show = (id) => {
    selected = id;
    detailHost.innerHTML = '';
    detailHost.appendChild(cardDetail(id, { onChange: () => ui.refresh() }));
  };

  for (const c of owned) {
    grid.appendChild(cardEl({
      unitId: c.id, level: c.save.level, shards: c.save.shards,
      selected: selected === c.id,
      onClick: id => { audio.play('page'); show(id); },
    }));
  }
  show(selected && State.hasCard(selected) ? selected : owned[0]?.id);
}

/* ==========================================================================
   RESEARCH
   ========================================================================== */

function buildResearch(body, ui) {
  body.appendChild(section('Research',
    'Research does not make a single card stronger — it changes the rules. Costs Research Scrolls, which every battle pays out.'));

  for (const bid in BRANCHES) {
    const br = BRANCHES[bid];
    const nodes = RESEARCH_LIST.filter(n => n.branch === bid).sort((a, b) => a.tier - b.tier);
    const h = document.createElement('div');
    h.className = 'h-rule mt16';
    h.innerHTML = `<h2 style="color:${br.color}">${br.icon} ${br.name}</h2>`;
    body.appendChild(h);

    const grid = document.createElement('div');
    grid.className = 'research';
    body.appendChild(grid);

    for (const n of nodes) {
      const done = State.s.research.includes(n.id);
      const avail = researchAvailable(n, State.s.research);
      const afford = State.canAfford(n.cost);

      const el = document.createElement('div');
      el.className = 'rnode' + (done ? ' done' : avail ? '' : ' locked');
      el.innerHTML = `
        <div class="rt">${n.icon} ${esc(n.name)}</div>
        <div class="rdd">${n.desc}</div>
        ${done ? '' : `<div class="matlist">${costList(n.cost, { showHave: true })}</div>`}
        ${!avail && !done ? `<div class="req" style="margin-top:6px;font-family:var(--f-ui);font-size:11px;letter-spacing:.1em;color:var(--blood-hi)">
            NEEDS ${n.requires.map(r => RESEARCH[r]?.name.toUpperCase()).join(' + ')}</div>` : ''}
      `;
      if (!done && avail) {
        const b = document.createElement('div');
        b.className = 'btn sm gold mt10' + (afford ? '' : ' dis');
        b.textContent = 'Research';
        b.onclick = (ev) => {
          ev.stopPropagation();
          if (State.doResearch(n.id)) {
            audio.play('upgrade');
            UI.toast(n.wizardLine || n.name, 'good', ic('mage'));
            ui.refresh();
          } else audio.play('ui.deny');
        };
        el.appendChild(b);
      }
      if (n.wizardLine) {
        const q = document.createElement('div');
        q.className = 'small muted mt10';
        q.style.fontStyle = 'italic';
        q.textContent = '“' + n.wizardLine + '”';
        el.appendChild(q);
      }
      grid.appendChild(el);
    }
  }
}

/* ==========================================================================
   ALCHEMY
   ========================================================================== */

function buildAlchemy(body, ui) {
  const wrap = document.createElement('div');
  wrap.className = 'two-col';
  body.appendChild(wrap);
  const left = document.createElement('div'), right = document.createElement('div');
  wrap.append(left, right);

  left.appendChild(section('Brewing', 'Potions are used by your commander mid-battle. You carry them into the fight in the slots on the right.'));

  for (const r of recipesFor('alchemy')) {
    const known = isDiscovered(r, State.s);
    const afford = State.canAfford(r.cost);
    const row = document.createElement('div');
    row.className = 'recipe' + (known ? '' : ' undisc');
    const outDef = r.kind === 'potion' ? POTIONS[r.out] : null;
    row.style.setProperty('--rc', outDef ? outDef.color : 'var(--iron)');
    row.innerHTML = `
      <div class="ric">${r.icon}</div>
      <div>
        <div class="rn">${esc(r.name)}</div>
        <div class="rd">${esc(r.desc || outDef?.desc || '')}</div>
        <div class="matlist">${known ? costList(r.cost, { showHave: true }) : '<span class="muted">Recipe not yet known</span>'}</div>
      </div>
      <div></div>`;
    if (known) {
      const b = document.createElement('div');
      b.className = 'btn sm gold' + (afford ? '' : ' dis');
      b.textContent = 'Brew';
      b.onclick = () => {
        const res = State.craft(r.id);
        if (res.ok) {
          audio.play('bubble');
          UI.toast(craftedText(res.result), 'good', r.icon);
          ui.refresh();
        } else audio.play('ui.deny');
      };
      row.lastElementChild.appendChild(b);
    }
    left.appendChild(row);
  }

  /* -------------------------------------------------- battle potion belt */
  right.appendChild(section('Potion Belt', `You may carry ${State.potionSlotCount()} potion type${State.potionSlotCount() > 1 ? 's' : ''} into battle.`));
  const belt = document.createElement('div');
  belt.className = 'col';
  for (let i = 0; i < State.potionSlotCount(); i++) {
    const cur = State.s.potionSlots[i];
    const def = cur ? POTIONS[cur] : null;
    const row = document.createElement('div');
    row.className = 'eqslot' + (def ? '' : ' empty');
    row.style.setProperty('--rc', def?.color || '#3d4453');
    row.innerHTML = `
      <div class="ic">${def?.icon || '—'}</div>
      <div class="tx">
        <div class="sl">Slot ${i + 1}</div>
        <div class="nm">${def ? esc(def.name) : 'Empty'}</div>
      </div>
      <div class="lv">${def ? '×' + (State.s.potions[cur] || 0) : ''}</div>`;
    row.onclick = () => pickPotion(i, ui);
    belt.appendChild(row);
  }
  right.appendChild(belt);

  const inv = document.createElement('div');
  inv.className = 'mt16';
  inv.appendChild(section('Stock', ''));
  const list = Object.entries(State.s.potions).filter(([, n]) => n > 0);
  if (!list.length) inv.appendChild(empty('No potions brewed.'));
  for (const [id, n] of list) {
    const def = POTIONS[id];
    if (!def) continue;
    const row = document.createElement('div');
    row.className = 'sbrow';
    row.innerHTML = `<span class="k">${def.icon} ${esc(def.name)}</span><span class="v">×${n}</span>`;
    inv.appendChild(row);
  }
  right.appendChild(inv);
}

function pickPotion(slot, ui) {
  const owned = Object.entries(State.s.potions).filter(([, n]) => n > 0);
  const opts = owned.map(([id]) => {
    const d = POTIONS[id];
    return `<div class="dopt" data-p="${id}"><span>${d.icon}</span><span>${esc(d.name)}</span>
      <span class="rq" style="color:var(--vel-3)">×${State.s.potions[id]}</span></div>`;
  }).join('');
  UI.overlay(`
    <div class="h-rule"><h2>Slot ${slot + 1}</h2></div>
    <div class="opts">${opts || '<div class="empty-note">Nothing brewed yet.</div>'}
      <div class="dopt" data-p=""><span>${ic('close')}</span><span>Leave empty</span></div>
    </div>`, (el, close) => {
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-p]');
      if (!p) return;
      State.setPotionSlot(slot, p.dataset.p || null);
      audio.play('ui.click');
      close();
      ui.refresh();
    });
  });
}

function craftedText(r) {
  if (!r) return 'Crafted';
  if (r.kind === 'potion') return `${POTIONS[r.id].name} ×${r.n}`;
  if (r.kind === 'item') return `${r.def.name} forged`;
  if (r.kind === 'material') return Object.entries(r.out).map(([k, v]) => `${MATERIALS[k]?.name || k} ×${v}`).join(', ');
  if (r.kind === 'shards') return `${UNITS[r.id]?.name} shards ×${r.n}`;
  return 'Crafted';
}

/* ==========================================================================
   AWAKENING
   ========================================================================== */

function buildAwaken(body, ui) {
  body.appendChild(section('The Awakening Rite',
    'A card at maximum level can be Awakened, unlocking its final ability — the one that defines what the card is actually for.'));

  const eligible = State.ownedCards().filter(c => c.save.level >= CFG.cards.awakenLevel);
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(330px,1fr))';

  if (!eligible.length) {
    body.appendChild(empty(`No card is at level ${CFG.cards.awakenLevel} yet. Get one there first.`));
    return;
  }

  for (const c of eligible) {
    const u = c.unit;
    const awakenAb = (u.abilities || []).map(id => ABILITIES[id]).find(a => a && a.awaken);
    const cost = State.awakenCost(c.id);
    const can = State.canAwaken(c.id);

    const el = document.createElement('div');
    el.className = 'recipe';
    el.style.setProperty('--rc', RARITY[u.rarity].color);
    el.innerHTML = `
      <div class="ric">${awakenAb?.icon || ic('star')}</div>
      <div>
        <div class="rn">${esc(u.name)}${c.save.awakened ? ' <span class="chip on">Awakened</span>' : ''}</div>
        <div class="rd">${awakenAb ? `<b>${esc(awakenAb.name)}</b> — ${awakenAb.desc({ statMult: 1, mods: {} })}` : 'No awakening ability.'}</div>
        ${c.save.awakened ? '' : `<div class="matlist">${costList(cost, { showHave: true })}</div>`}
      </div>
      <div></div>`;
    if (!c.save.awakened && awakenAb) {
      const b = document.createElement('div');
      b.className = 'btn gold' + (can ? '' : ' dis');
      b.textContent = 'Awaken';
      b.onclick = () => {
        if (State.awakenCard(c.id)) {
          audio.play('levelup');
          UI.toast(`${u.name} awakened`, 'legend', ic('star'));
          Thumbs.invalidate(c.id);
          ui.refresh();
        } else audio.play('ui.deny');
      };
      el.lastElementChild.appendChild(b);
    }
    grid.appendChild(el);
  }
  body.appendChild(grid);
}

/* ==========================================================================
   CODEX
   ========================================================================== */

function buildCodex(body, ui) {
  const tabs = document.createElement('div');
  tabs.className = 'filterbar';
  const opts = [
    ['factions', 'Enemies'], ['counters', 'Counters'], ['synergies', 'Synergies'],
    ['statuses', 'Conditions'], ['lore', 'Records'],
  ];
  tabs.innerHTML = opts.map(([id, n]) => `<span class="chip${codexTab === id ? ' on' : ''}" data-c="${id}">${n}</span>`).join('');
  tabs.addEventListener('click', e => {
    const id = e.target.closest('[data-c]')?.dataset.c;
    if (!id) return;
    codexTab = id; audio.play('page'); ui.refresh();
  });
  body.appendChild(tabs);

  if (codexTab === 'factions') {
    const list = document.createElement('div');
    list.className = 'codexlist';
    for (const f of FACTION_LIST) {
      const seen = State.s.codex.factions.includes(f.id) || State.bonuses.codexFull;
      const el = document.createElement('div');
      el.className = 'codexent';
      el.style.borderColor = seen ? f.color : '#333a47';
      el.innerHTML = seen ? `
        <h4>${f.icon} ${esc(f.name)}</h4>
        <p>${esc(f.identity)}</p>
        <p style="margin-top:7px"><b style="color:#8fe09a">Strength:</b> ${esc(f.strength)}</p>
        <p style="margin-top:4px"><b style="color:#f0938a">Weakness:</b> ${esc(f.weakness)}</p>
        <p style="margin-top:7px;font-style:italic;color:var(--gold)">${esc(f.counterAdvice)}</p>
        <div class="matlist mt10">${(f.roster || []).map(id => `<span class="tag">${UNITS[id]?.name || id}</span>`).join('')}</div>`
        : `<h4>${f.icon} ???</h4><p class="muted">Fight them and the Wizard will write it up.</p>`;
      list.appendChild(el);
    }
    body.appendChild(list);
    return;
  }

  if (codexTab === 'counters') {
    body.appendChild(section('The Counter Table',
      'Damage type down the side, armour type across the top. This table decides more battles than anything else in the game.'));
    const d = document.createElement('div');
    d.innerHTML = counterMatrix();
    body.appendChild(d);
    const note = document.createElement('div');
    note.className = 'advice mt16';
    note.innerHTML = `Blunt opens plate. Pierce shreds the unarmoured and shatters on heavy. Holy doubles against undead.
      Poison does essentially nothing to the dead. Arcane eats heavy armour but is refused by magical wards.
      Shadow is the anti-elite type. Bring at least three damage types and no enemy can armour against all of you.`;
    body.appendChild(note);
    return;
  }

  if (codexTab === 'synergies') {
    body.appendChild(section('Synergies', 'Deck synergies come from what you bring. Field synergies come from where you put it. Combos come from what you do.'));
    for (const [title, list] of [['Deck', DECK_SYNERGIES], ['Field', FIELD_SYNERGIES.concat(Object.values(SYNERGIES).filter(s => s.kind === 'field' && s.passive))], ['Combos', COMBO_SYNERGIES]]) {
      const h = document.createElement('div');
      h.className = 'h-rule mt16';
      h.innerHTML = `<h2>${title}</h2>`;
      body.appendChild(h);
      const g = document.createElement('div');
      g.className = 'codexlist';
      for (const s of list) {
        const el = document.createElement('div');
        el.className = 'codexent';
        el.innerHTML = `<h4>${s.icon} ${esc(s.name)}</h4><p>${s.desc}</p>
          ${s.detail ? `<p style="margin-top:6px;font-style:italic;color:var(--vel-3)">${s.detail}</p>` : ''}`;
        g.appendChild(el);
      }
      body.appendChild(g);
    }
    return;
  }

  if (codexTab === 'statuses') {
    const g = document.createElement('div');
    g.className = 'codexlist';
    for (const id in STATUS) {
      const s = STATUS[id];
      const el = document.createElement('div');
      el.className = 'codexent';
      el.style.borderLeft = `3px solid ${s.color}`;
      el.innerHTML = `<h4>${s.icon} ${esc(s.name)}</h4>
        <p><span class="tag">${s.kind}</span>${s.stackable ? ` <span class="tag">stacks to ${s.maxStacks}</span>` : ''}</p>
        <p style="margin-top:6px">${esc(s.desc || '')}</p>`;
      g.appendChild(el);
    }
    body.appendChild(g);
    return;
  }

  /* lore */
  const entries = State.s.codex.entries;
  body.appendChild(section('Records', 'Things you found and the Wizard filed.'));
  if (!entries.length) { body.appendChild(empty('Nothing recorded yet. Explore.')); return; }
  const g = document.createElement('div');
  g.className = 'codexlist';
  for (const id of entries) {
    const e = LORE[id];
    if (!e) continue;
    const el = document.createElement('div');
    el.className = 'codexent';
    el.innerHTML = `<h4>${e.title}</h4><p>${e.text}</p>`;
    g.appendChild(el);
  }
  body.appendChild(g);
}

const LORE = {
  morvant: {
    title: 'The Last Entry',
    text: '“They will not let me finish the index. I have found a way to finish the index.” The handwriting does not change at all between the sentence before and the sentence after. Vaelthorn has read it nine times and will not discuss it.',
  },
  hollow: {
    title: 'What Is At The Bottom',
    text: 'There is a floor. There is something on the floor. It did not follow you up, which is the only fact about it you are certain of, and you have thought about it every day since.',
  },
  lanterns: {
    title: 'The Lantern Keeper',
    text: 'Small, patient, and carrying a taper. It nodded to you. Four hundred years of lighting a row of lamps in a drowned town, every night, for nobody. The Wizard says it is not undead. He does not say what it is.',
  },
  gharuk: {
    title: "Gharuk's Camp",
    text: 'Your scouts counted no reserves, no rear guard and no supply line. The Warchief keeps everything at the front, including himself. It is not stupidity — it is a statement about how long he expects the war to last.',
  },
  warden: {
    title: 'The Order Still Standing',
    text: '"Hold." That was the whole instruction. The king is six centuries of dust and the Warden has not moved. Vaelthorn admits, finally, that there was always a way to release it — four pylons — and that he spent three hundred years not looking for it.',
  },
};
