/* ScreenForge.js — Dunnick's forge: crafting and upgrading equipment. */

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { costList, section, empty, itemCell, itemTooltip, button } from './Widgets.js';
import { RECIPES, recipesFor, isDiscovered } from '../data/Recipes.js';
import { ITEMS, SLOTS, SLOT_ORDER, itemStatsAt, WEAPON_CLASSES } from '../data/Items.js';
import { MATERIALS } from '../data/Materials.js';
import { RARITY } from '../core/Config.js';
import { audio } from '../core/Audio.js';
import { esc, commas, formatNum } from '../core/Util.js';
import { ic } from '../art/Icons.js';

let tab = 'craft';
let craftFilter = 'all';
let selectedUid = null;

export const ScreenForge = {
  id: 'forge',

  build(el, args, ui) {
    if (args?.tab) tab = args.tab;
    const parts = ui.scaffold(el, {
      icon: ic('hammer'),
      title: 'The Forge',
      blurb: 'Dunnick Ore, third-generation Crown smith, and a fire that has not gone out in ninety years.',
      tabs: [
        { id: 'craft', name: 'Forge', icon: ic('hammer') },
        { id: 'upgrade', name: 'Temper', icon: ic('chevron') },
        { id: 'materials', name: 'Materials', icon: ic('crate') },
      ],
      activeTab: ['craft', 'upgrade', 'materials'].indexOf(tab),
      onTab: id => { tab = id; ui.refresh(); },
    });

    if (tab === 'craft') buildCraft(parts.body, ui);
    else if (tab === 'upgrade') buildUpgrade(parts.body, ui);
    else buildMaterials(parts.body, ui);
  },
};

/* ==========================================================================
   CRAFT
   ========================================================================== */

function buildCraft(body, ui) {
  const all = recipesFor('forge');
  const known = all.filter(r => isDiscovered(r, State.s));
  const hidden = all.length - known.length;

  body.appendChild(section('Forging',
    `${known.length} recipe${known.length === 1 ? '' : 's'} known${hidden > 0 ? `, ${hidden} still out of reach — research and new regions unlock the rest.` : '.'}`));

  const chips = [
    { id: 'all', name: 'All' }, { id: 'weapon', name: 'Weapons' },
    { id: 'armour', name: 'Armour' }, { id: 'material', name: 'Refining' },
    { id: 'ready', name: 'Can make now' },
  ];
  const bar = document.createElement('div');
  bar.className = 'filterbar';
  bar.innerHTML = chips.map(c => `<span class="chip${craftFilter === c.id ? ' on' : ''}" data-f="${c.id}">${c.name}</span>`).join('');
  bar.addEventListener('click', e => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    craftFilter = f; audio.play('ui.click'); ui.refresh();
  });
  body.appendChild(bar);

  const grid = document.createElement('div');
  grid.className = 'col';
  body.appendChild(grid);

  let list = all.slice();
  if (craftFilter === 'weapon') list = list.filter(r => r.kind === 'item' && ITEMS[r.out]?.slot === 'weapon');
  else if (craftFilter === 'armour') list = list.filter(r => r.kind === 'item' && ITEMS[r.out] && ITEMS[r.out].slot !== 'weapon');
  else if (craftFilter === 'material') list = list.filter(r => r.kind === 'material');
  else if (craftFilter === 'ready') list = list.filter(r => isDiscovered(r, State.s) && State.canAfford(discount(r.cost)));

  list.sort((a, b) => {
    const ka = isDiscovered(a, State.s) ? 0 : 1, kb = isDiscovered(b, State.s) ? 0 : 1;
    if (ka !== kb) return ka - kb;
    const ta = ITEMS[a.out]?.tier || 1, tb = ITEMS[b.out]?.tier || 1;
    return ta - tb;
  });

  if (!list.length) { grid.appendChild(empty('Nothing here yet.')); return; }

  for (const r of list) {
    const discovered = isDiscovered(r, State.s);
    const cost = discount(r.cost);
    const afford = State.canAfford(cost);
    const out = r.kind === 'item' ? ITEMS[r.out] : null;

    const row = document.createElement('div');
    row.className = 'recipe' + (discovered ? '' : ' undisc');
    if (out) row.style.setProperty('--rc', RARITY[out.rarity].color);

    const wc = out?.wclass ? WEAPON_CLASSES[out.wclass] : null;
    row.innerHTML = `
      <div class="ric">${r.icon}</div>
      <div>
        <div class="rn">${esc(r.name)}${out ? ` <span class="tag">${RARITY[out.rarity].name}</span>` : ''}</div>
        <div class="rd">${esc(r.desc || out?.desc || '')}</div>
        ${out ? `<div class="matlist" style="margin-bottom:5px">${statChips(out)}</div>` : ''}
        ${wc ? `<div class="small muted" style="font-style:italic;margin-bottom:5px">${esc(wc.name)} — ${esc(wc.desc)}</div>` : ''}
        <div class="matlist">${discovered ? costList(cost, { showHave: true }) : `<span class="muted">${lockText(r)}</span>`}</div>
      </div>
      <div></div>`;

    if (discovered) {
      const b = document.createElement('div');
      b.className = 'btn gold' + (afford ? '' : ' dis');
      b.textContent = r.kind === 'material' ? 'Refine' : 'Forge';
      b.onclick = () => {
        const res = State.craft(r.id);
        if (!res.ok) { audio.play('ui.deny'); return; }
        audio.play(r.kind === 'material' ? 'craft' : 'anvil');
        if (res.result.kind === 'item') {
          UI.toast(`${res.result.def.name} forged`, res.result.def.rarity === 'legendary' ? 'legend' : 'good', res.result.def.icon);
          UI.confirm('Equip it?', `Dunnick hands you the <b>${esc(res.result.def.name)}</b>, still warm.`,
            () => { State.equipItem(res.result.item.uid, res.result.def.slot === 'trinket1' ? 'trinket1' : res.result.def.slot); ui.refresh(); },
            'Equip');
        } else {
          UI.toast('Refined', 'good', r.icon);
        }
        ui.refresh();
      };
      row.lastElementChild.appendChild(b);
    }
    grid.appendChild(row);
  }
}

function statChips(item) {
  const st = itemStatsAt(item, 1);
  return Object.entries(st).filter(([, v]) => v).map(([k, v]) =>
    `<span class="mat">${LBL[k] || k} ${k === 'weight' ? '' : '+'}${v}</span>`).join('');
}
const LBL = { might: ic('swords'), focus: ic('spark'), vigor: ic('heart'), armor: ic('shield'), haste: ic('stamina'), weight: ic('scales') };

function discount(cost) {
  const c = { ...cost };
  if (c.gold) c.gold = Math.round(c.gold * (1 - State.bonuses.forgeDiscount));
  return c;
}

function lockText(r) {
  const u = r.unlock || {};
  if (u.research) return 'Requires research: ' + u.research;
  if (u.region) return 'Requires reaching a later region';
  return 'Not yet known';
}

/* ==========================================================================
   TEMPER (item upgrades)
   ========================================================================== */

function buildUpgrade(body, ui) {
  const wrap = document.createElement('div');
  wrap.className = 'two-col';
  body.appendChild(wrap);
  const left = document.createElement('div'), right = document.createElement('div');
  wrap.append(left, right);

  left.appendChild(section('Tempering',
    'Every level adds 11% to an item\'s stats — except weight, which never grows. Your armour does not get heavier as it gets better.'));

  const items = State.s.items.slice().sort((a, b) => {
    const da = ITEMS[a.id], db = ITEMS[b.id];
    return (RARITY[db.rarity].order - RARITY[da.rarity].order) || (db.tier - da.tier);
  });

  if (!items.length) { left.appendChild(empty('You own no equipment.')); return; }

  const equippedUids = new Set(Object.values(State.s.equipped));
  const grid = document.createElement('div');
  grid.className = 'itemlist';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(58px,1fr))';
  for (const it of items) {
    grid.appendChild(itemCell(it, {
      equipped: equippedUids.has(it.uid),
      onClick: (item) => { selectedUid = item.uid; audio.play('ui.click'); show(); },
    }));
  }
  left.appendChild(grid);

  const host = document.createElement('div');
  right.appendChild(host);

  function show() {
    const it = State.itemByUid(selectedUid) || items[0];
    if (!it) { host.innerHTML = ''; return; }
    selectedUid = it.uid;
    const def = ITEMS[it.id];
    const cur = itemStatsAt(def, it.level);
    const next = it.level < (def.maxLevel || 10) ? itemStatsAt(def, it.level + 1) : null;
    const cost = State.itemCost(it);

    host.innerHTML = `
      <div class="detail" style="--rc:${RARITY[def.rarity].color}">
        <div class="body" style="border-radius:var(--r-md)">
          <h3>${def.icon} ${esc(def.name)}</h3>
          <div class="rowflex gap6 mt10">
            <span class="tag">${RARITY[def.rarity].name}</span>
            <span class="tag">${SLOTS[def.slot]?.name || def.family}</span>
            <span class="tag">+${it.level - 1}</span>
            ${def.family ? `<span class="tag">${def.family}</span>` : ''}
          </div>
          <div class="lore">${esc(def.desc || '')}</div>
          <div class="statblock">
            ${Object.entries(cur).filter(([, v]) => v).map(([k, v]) => `
              <div class="sbrow"><span class="k">${FULL[k] || k}</span>
              <span class="v">${v}${next && next[k] !== v ? `<span class="d pos">→ ${next[k]}</span>` : ''}</span></div>`).join('')}
          </div>
          ${def.legendary ? `<div class="advice mt10">${esc(def.legendary)}</div>` : ''}
          <div class="costline">
            <div class="costs">${next ? costList(cost, { showHave: true }) : '<span class="sub">Maximum temper.</span>'}</div>
          </div>
        </div>
      </div>`;

    if (next) {
      const b = document.createElement('div');
      b.className = 'btn gold wide mt10' + (State.canAfford(cost) ? '' : ' dis');
      b.textContent = `Temper to +${it.level}`;
      b.onclick = () => {
        if (State.upgradeItem(it.uid)) { audio.play('anvil'); UI.toast(`${def.name} tempered`, 'good', ic('chevron')); ui.refresh(); }
        else audio.play('ui.deny');
      };
      host.appendChild(b);
    }
  }
  show();
}

const FULL = { might: 'Might', focus: 'Focus', vigor: 'Health', armor: 'Armour', haste: 'Haste', weight: 'Weight' };

/* ==========================================================================
   MATERIALS
   ========================================================================== */

function buildMaterials(body, ui) {
  body.appendChild(section('Materials', 'Everything you are carrying, and where more of it comes from.'));
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(260px,1fr))';

  const byTier = {};
  for (const m of Object.values(MATERIALS)) (byTier[m.tier] = byTier[m.tier] || []).push(m);

  for (const t of Object.keys(byTier).sort()) {
    const h = document.createElement('div');
    h.className = 'h-rule mt16';
    h.style.gridColumn = '1/-1';
    h.innerHTML = `<h2>Tier ${t}</h2>`;
    grid.appendChild(h);
    for (const m of byTier[t]) {
      const have = State.count(m.id);
      const el = document.createElement('div');
      el.className = 'codexent';
      el.style.opacity = have ? 1 : 0.5;
      el.style.borderLeft = `3px solid ${m.color}`;
      el.innerHTML = `<h4>${m.icon} ${esc(m.name)} <span style="float:right;font-family:var(--f-mono);color:var(--vel-0)">${formatNum(have)}</span></h4>
        <p>${esc(m.desc)}</p>
        <p style="margin-top:5px;color:var(--vel-3);font-style:italic">${esc(m.source || '')}</p>`;
      grid.appendChild(el);
    }
  }
  body.appendChild(grid);
}
