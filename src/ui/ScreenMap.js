/* ScreenMap.js — the war map, the pre-battle briefing, and exploration events.

   The briefing is the strategy screen: it tells you what you are walking into
   (roster, armour profile, the node's mechanic) and lets you change your army
   without leaving. A player who reads the briefing should never lose to a
   surprise, only to a decision.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { section, empty, miniCardEl, compositionMeter, costList, button } from './Widgets.js';
import { REGIONS, REGION_LIST, MODIFIERS, findNode, endlessWave } from '../data/Campaign.js';
import { EVENTS } from '../data/Dialogue.js';
import { FACTIONS } from '../data/Factions.js';
import { UNITS, threatScore, ROLE_INFO } from '../data/Units.js';
import { RARITY, CFG, counterMult } from '../core/Config.js';
import { activeDeckSynergies } from '../data/Synergies.js';
import { resolveEvent } from '../game/Progression.js';
import { audio } from '../core/Audio.js';
import { esc, commas, formatNum, clamp, makeRng } from '../core/Util.js';
import { ic } from '../art/Icons.js';

let region = null;

export const ScreenMap = {
  id: 'map',

  build(el, args, ui) {
    region = args?.region || State.s.currentRegion || 'greenmarch';
    if (!State.regionUnlocked(region)) region = 'greenmarch';

    const parts = ui.scaffold(el, {
      icon: ic('map'),
      title: 'The War Map',
      blurb: 'Every node is a choice. Some of them are fights.',
    });
    buildMap(parts.body, ui);
  },
};

/* ==========================================================================
   MAP
   ========================================================================== */

function buildMap(body, ui) {
  /* ---- region selector ---- */
  const picker = document.createElement('div');
  picker.className = 'regionpick';
  for (const r of REGION_LIST) {
    const unlocked = State.regionUnlocked(r.id);
    const prog = State.regionProgress(r.id);
    const b = document.createElement('div');
    b.className = 'regbtn' + (region === r.id ? ' on' : '') + (unlocked ? '' : ' locked');
    b.innerHTML = `
      <div class="rn">${r.icon} ${esc(r.name)}</div>
      <div class="rs">${unlocked ? `Lv ${r.recommendedLevel}+ · ${Math.round(prog * 100)}% cleared` : 'Locked'}</div>
      <div class="rp"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>`;
    if (unlocked) b.onclick = () => { region = r.id; State.s.currentRegion = r.id; State.mark(); audio.play('ui.click'); ui.refresh(); };
    picker.appendChild(b);
  }
  body.appendChild(picker);

  const reg = REGIONS[region];

  const blurb = document.createElement('div');
  blurb.className = 'sub mb10';
  blurb.innerHTML = `<b style="color:${reg.color}">${esc(reg.tagline)}</b> — ${esc(reg.desc)}`;
  body.appendChild(blurb);

  /* ---- the map canvas ---- */
  const wrap = document.createElement('div');
  wrap.className = 'mapcanvas';
  body.appendChild(wrap);

  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);

  const nodes = reg.nodes;
  const state = nodes.map(n => ({
    n,
    cleared: State.nodeCleared(n.id),
    available: State.nodeAvailable(region, n),
  }));

  for (const s of state) {
    const el = document.createElement('div');
    const cls = s.cleared ? 'done' : s.available ? 'next' : 'locked';
    el.className = `mapnode ${cls}` + (s.n.type === 'boss' ? ' boss' : s.n.type === 'elite' ? ' elite' : '');
    el.style.left = s.n.x + '%';
    el.style.top = s.n.y + '%';
    el.innerHTML = `<div class="disc">${nodeIcon(s.n)}</div><div class="nl">${esc(s.n.name)}</div>`;
    if (s.available || s.cleared) {
      el.onclick = () => {
        audio.play('ui.click');
        if (s.n.type === 'explore' || s.n.type === 'camp') openEvent(s.n, ui);
        else if (s.n.type === 'cache') openCache(s.n, reg, ui);
        else if (s.n.type === 'endless') openEndless(s.n, reg, ui);
        else openBriefing(s.n, reg, ui);
      };
    }
    el.dataset.tip = 'node:' + s.n.id;
    wrap.appendChild(el);
  }

  // draw the connecting paths once the layout has settled
  requestAnimationFrame(() => drawPaths(canvas, wrap, reg, state));
  const ro = new ResizeObserver(() => drawPaths(canvas, wrap, reg, state));
  ro.observe(wrap);

  /* ---- legend ---- */
  const legend = document.createElement('div');
  legend.className = 'rowflex gap6 mt10';
  legend.innerHTML = `
    <span class="chip">${ic('swords')} Battle</span>
    <span class="chip">${ic('medal')} Elite — harder, better rewards</span>
    <span class="chip">${ic('crown')} Boss — has a stated mechanic</span>
    <span class="chip">${ic('compass')} Explore — a choice, not a fight</span>
    <span class="chip">${ic('crate')} Cache — repeatable materials</span>
    <span class="chip">${ic('flame')} Camp — a story beat</span>`;
  body.appendChild(legend);
}

function nodeIcon(n) {
  if (n.icon) return n.icon;
  return { battle: ic('swords'), elite: ic('medal'), boss: ic('crown'), explore: ic('compass'), cache: ic('crate'), camp: ic('flame'), endless: ic('infinity') }[n.type] || ic('swords');
}

function drawPaths(canvas, wrap, reg, state) {
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);

  const pos = {};
  for (const n of reg.nodes) pos[n.id] = { x: n.x / 100 * r.width, y: n.y / 100 * r.height };

  for (const s of state) {
    for (const req of s.n.requires || []) {
      const a = pos[req], b = pos[s.n.id];
      if (!a || !b) continue;
      const done = State.nodeCleared(req);
      c.beginPath();
      c.moveTo(a.x, a.y);
      // a gentle curve reads as a road rather than a wire
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y), ny = (b.x - a.x);
      const l = Math.hypot(nx, ny) || 1;
      c.quadraticCurveTo(mx + nx / l * 18, my + ny / l * 18, b.x, b.y);
      c.strokeStyle = done ? 'rgba(217,164,65,.55)' : 'rgba(255,255,255,.12)';
      c.lineWidth = done ? 2.5 : 1.6;
      c.setLineDash(done ? [] : [5, 6]);
      c.stroke();
    }
  }
  c.setLineDash([]);
}

/* ==========================================================================
   BRIEFING
   ========================================================================== */

export function openBriefing(node, reg, ui) {
  const screen = {
    id: 'briefing',
    build(el, args, u) {
      const parts = u.scaffold(el, {
        icon: nodeIcon(node),
        title: node.name,
        blurb: esc(reg.name) + ' · ' + (node.type === 'boss' ? 'Commander battle' : node.type === 'elite' ? 'Elite battle' : 'Battle'),
        foot: true,
      });
      buildBriefing(parts.body, parts.foot, node, reg, u);
    },
  };
  UI.open(screen);
}

function buildBriefing(body, foot, node, reg, ui) {
  const faction = FACTIONS[node.faction] || FACTIONS.goblin;
  const level = node.level || 1;
  const reveal = State.bonuses.revealEnemies || State.nodeCleared(node.id);

  const grid = document.createElement('div');
  grid.className = 'brief';
  body.appendChild(grid);
  const left = document.createElement('div'), right = document.createElement('div');
  grid.append(left, right);

  /* --------------------------------------------------------- the enemy */
  left.appendChild(section('The Opposition', esc(node.intro || '')));

  const threat = document.createElement('div');
  threat.className = 'threatbox mb10';
  const yourPower = powerOf(State.deckUnits().map(u => ({ u, lvl: State.card(u.id)?.level || 1 })));
  const theirPower = powerOf((node.enemyDeck || []).map(id => ({ u: UNITS[id], lvl: level })))
    + (node.boss ? threatScore(UNITS[node.boss], level) * 2 : 0);
  const ratio = theirPower / Math.max(1, yourPower);
  threat.innerHTML = `
    <div style="font-size:28px">${faction.icon}</div>
    <div>
      <div class="tl">${esc(faction.name)} · Level ${level}</div>
      <div class="small">${ratio < 0.8 ? 'You outmatch them comfortably.'
      : ratio < 1.1 ? 'An even fight. Composition will decide it.'
        : ratio < 1.5 ? 'They have the edge. Bring the right counters.'
          : 'Considerably stronger than your army. Upgrade first, or play very well.'}</div>
    </div>`;
  left.appendChild(threat);

  if (reveal) {
    const roster = document.createElement('div');
    roster.className = 'enemyroster mb10';
    const shown = [...(node.enemyDeck || [])];
    if (node.boss) shown.unshift(node.boss);
    for (const id of shown) {
      const u = UNITS[id];
      if (!u) continue;
      const el = document.createElement('div');
      el.className = 'eunit';
      el.style.setProperty('--rc', RARITY[u.rarity].color);
      el.innerHTML = `<span>${ROLE_INFO[u.role]?.icon || ic('swords')}</span><span>${esc(u.name)}</span>
        <span class="eq">${u.armorType}</span>`;
      el.dataset.tip = 'card:' + id + ':' + level;
      roster.appendChild(el);
    }
    left.appendChild(roster);

    /* armour profile → what damage you should bring */
    left.appendChild(armourAdvice(node, level));
  } else {
    const hidden = document.createElement('div');
    hidden.className = 'advice mb10';
    hidden.innerHTML = `Their exact roster is unknown. <b>Cartography</b> research in the Library reveals enemy composition before you commit.`;
    left.appendChild(hidden);
  }

  /* ---- modifiers ---- */
  if (node.modifiers?.length) {
    left.appendChild(section('Battlefield Conditions', ''));
    for (const m of node.modifiers) {
      const def = MODIFIERS[m];
      if (!def) continue;
      const row = document.createElement('div');
      row.className = 'threatbox mb10';
      row.innerHTML = `<div style="font-size:22px">${def.icon}</div>
        <div><div class="tl" style="font-size:14px">${esc(def.name)}</div><div class="small">${esc(def.desc)}</div></div>`;
      left.appendChild(row);
    }
  }

  /* ---- boss mechanic: always shown, never a surprise ---- */
  if (node.mechanic) {
    const m = document.createElement('div');
    m.className = 'threatbox mb10';
    m.style.borderColor = 'var(--gold-lo)';
    m.style.background = 'linear-gradient(90deg,rgba(217,164,65,.2),rgba(15,17,22,.9))';
    m.innerHTML = `<div style="font-size:24px">${ic('crown')}</div>
      <div><div class="tl" style="color:var(--gold-hi)">The Mechanic</div><div class="small">${esc(node.mechanic)}</div></div>`;
    left.appendChild(m);
  }

  /* ---- terrain ---- */
  const terr = document.createElement('div');
  terr.className = 'advice mb10';
  terr.innerHTML = `<b>${FIELD_NAME[node.field] || 'Open ground'}.</b> ${FIELD_ADVICE[node.field] || FIELD_ADVICE.open}`;
  left.appendChild(terr);

  /* ------------------------------------------------------------ your army */
  right.appendChild(section('Your Army', ''));
  const strip = document.createElement('div');
  strip.className = 'deckstrip mb10';
  for (const id of State.s.deck) strip.appendChild(miniCardEl(id, State.card(id)?.level || 1));
  right.appendChild(strip);

  const units = State.deckUnits();
  const comp = document.createElement('div');
  comp.innerHTML = compositionMeter(units)
    + `<div class="avgcost mt10">Average cost <span class="n">${State.deckAvgCost().toFixed(2)}</span></div>`;
  right.appendChild(comp);

  const syn = activeDeckSynergies(units);
  if (syn.length) {
    const s = document.createElement('div');
    s.className = 'mt10';
    s.innerHTML = syn.map(x => `<span class="chip on" style="margin:2px">${x.icon} ${esc(x.name)}</span>`).join('');
    right.appendChild(s);
  }

  right.appendChild(button('Change army', 'ghost wide mt10', () => {
    import('./ScreenArmy.js').then(m => UI.open(m.ScreenArmy, { tab: 'deck' }));
  }));

  /* ---- rewards ---- */
  right.appendChild(section('Expected Rewards', ''));
  const rw = node.rewards || {};
  const rwEl = document.createElement('div');
  rwEl.className = 'matlist';
  rwEl.innerHTML = [
    rw.gold ? `<span class="mat">${ic('coin')} ~${formatNum(rw.gold)}</span>` : '',
    rw.xp ? `<span class="mat">${ic('spark')} ${formatNum(rw.xp)} xp</span>` : '',
    rw.shards ? `<span class="mat">${ic('crystal')} ~${rw.shards}</span>` : '',
    rw.scroll ? `<span class="mat">${ic('scroll')} ${rw.scroll}</span>` : '',
    rw.warSeal ? `<span class="mat">${ic('medal')} ${rw.warSeal}</span>` : '',
    ...Object.entries(rw.mats || {}).map(([k, v]) => `<span class="mat">${k} ×${v}</span>`),
  ].join('');
  right.appendChild(rwEl);

  if (!State.nodeCleared(node.id) && node.first) {
    const fc = document.createElement('div');
    fc.className = 'advice mt10';
    fc.innerHTML = `<b style="color:var(--gold)">First clear bonus:</b> ${firstClearText(node.first)}`;
    right.appendChild(fc);
  }

  /* ------------------------------------------------------------- footer */
  const canFight = State.deckValid();
  foot.innerHTML = `<div class="growr sub">${canFight ? '' : `Your army needs at least ${CFG.army.minDeck} cards before you can march. Open Army and fill the empty slots.`}</div>`;
  foot.appendChild(button('Back', 'ghost', () => UI.close()));
  const go = button('March', 'gold lg' + (canFight ? '' : ' dis'), () => {
    if (!canFight) { audio.play('ui.deny'); return; }
    UI.closeAll();
    UI.onStartBattle?.({ node, region: reg });
  });
  foot.appendChild(go);
}

function powerOf(list) {
  let p = 0;
  for (const { u, lvl } of list) if (u) p += threatScore(u, lvl);
  return p;
}

function armourAdvice(node, level) {
  const el = document.createElement('div');
  el.className = 'mb10';
  const counts = {};
  const ids = [...(node.enemyDeck || [])];
  if (node.boss) ids.push(node.boss);
  for (const id of ids) {
    const u = UNITS[id];
    if (u) counts[u.armorType] = (counts[u.armorType] || 0) + (u.count || 1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  // score every damage type against the actual mix
  const scores = [];
  for (const dt of ['slash', 'pierce', 'blunt', 'arcane', 'fire', 'frost', 'poison', 'holy', 'shadow']) {
    let s = 0;
    for (const at in counts) s += counterMult(dt, at) * counts[at];
    scores.push({ dt, v: s / total });
  }
  scores.sort((a, b) => b.v - a.v);
  const best = scores.slice(0, 3), worst = scores.slice(-2);
  const mine = new Set(State.deckUnits().map(u => u.dmgType));

  el.innerHTML = `
    <div class="sub" style="font-style:normal">
      <b>Their armour:</b> ${Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(' · ')}
    </div>
    <div class="advice mt10">
      <b style="color:#8fe09a">Bring:</b> ${best.map(b => `<span class="t-${b.dt}">${b.dt}</span> (×${b.v.toFixed(2)})${mine.has(b.dt) ? ' ' + ic('check') : ''}`).join(', ')}<br>
      <b style="color:#f0938a">Avoid relying on:</b> ${worst.map(b => `<span class="t-${b.dt}">${b.dt}</span> (×${b.v.toFixed(2)})${mine.has(b.dt) ? ' ' + ic('quest') + ' in your deck' : ''}`).join(', ')}
    </div>`;
  return el;
}

const FIELD_NAME = {
  open: 'Open ground', bridge: 'A river with two crossings', ridge: 'A central ridge',
  forest: 'Heavy forest', canyon: 'A narrow canyon', ruins: 'Scattered ruins',
  crypt: 'Walled crypt corridors', spire: 'Raised platforms',
};
const FIELD_ADVICE = {
  open: 'Nothing stops a charge. Cavalry, big pushes and flankers all work.',
  bridge: 'Only a few units can fight at once. Swarms and area damage rule; cavalry is wasted.',
  ridge: 'Whoever holds the ridge wins the ranged war — archers there gain 25% range and 20% damage.',
  forest: 'Cover cuts ranged damage by 25%. Melee can close safely; archers are blunted.',
  canyon: 'One narrow middle. The purest chokepoint fight in the game — hold it, do not race through it.',
  ruins: 'Blockers and cover everywhere. Assassins and flankers thrive; straight lines do not exist.',
  crypt: 'Tight corridors and short sightlines. Swarms and summons excel; artillery struggles.',
  spire: 'Raised platforms are high ground. Position decides this one before damage does.',
};

function firstClearText(f) {
  const bits = [];
  if (f.gold) bits.push(`${ic('coin')} ${formatNum(f.gold)}`);
  if (f.cards) bits.push(...f.cards.map(c => `${ic('cards')} ${UNITS[c]?.name || c}`));
  if (f.mats) bits.push(...Object.entries(f.mats).map(([k, v]) => `${k} ×${v}`));
  if (f.scroll) bits.push(`${ic('scroll')} ${f.scroll}`);
  if (f.unlocks) bits.push(`${ic('map')} unlocks ${REGIONS[f.unlocks]?.name}`);
  return bits.join(' · ');
}

/* ==========================================================================
   EXPLORATION EVENTS
   ========================================================================== */

export function openEvent(node, ui) {
  const ev = EVENTS[node.event];
  if (!ev) { UI.toast('Nothing here.', 'bad'); return; }
  const done = State.nodeCleared(node.id);

  const screen = {
    id: 'event',
    build(el, args, u) {
      const parts = u.scaffold(el, { icon: node.icon || ic('compass'), title: ev.title, blurb: esc(node.intro || '') });
      const card = document.createElement('div');
      card.className = 'eventcard';
      parts.body.appendChild(card);
      card.innerHTML = `
        <div class="scene" style="background:${sceneBg(ev.scene)}"></div>
        <div class="txtbox">
          <p>${ev.text}</p>
          <div class="opts" id="evopts"></div>
        </div>`;
      const opts = card.querySelector('#evopts');

      if (done) {
        opts.innerHTML = '<div class="empty-note">You have already been here. The place is picked clean.</div>';
        parts.body.appendChild(button('Back', 'ghost mt16', () => UI.close()));
        return;
      }

      ev.opts.forEach((o, i) => {
        const d = document.createElement('div');
        d.className = 'dopt';
        d.innerHTML = `<span class="n">${i + 1}</span><span>${esc(o.label)}</span>
          ${o.risk ? `<span class="rq">${Math.round(o.risk * 100)}% risk</span>` : ''}`;
        d.onclick = () => {
          const res = resolveEvent(node, ev, i);
          audio.play(res.success ? 'coin' : 'ui.deny');
          showOutcome(card, res, ev);
        };
        opts.appendChild(d);
      });
    },
  };
  UI.open(screen);
}

function showOutcome(card, res, ev) {
  const box = card.querySelector('.txtbox');
  box.innerHTML = `
    <p>${esc(res.text)}</p>
    <div class="rewardrow mt16" id="ro"></div>
    <div class="rowflex mt16" style="justify-content:flex-end"><div class="btn gold" id="done">Move on</div></div>`;
  const ro = box.querySelector('#ro');
  const add = (icon, val, label) => {
    const d = document.createElement('div');
    d.className = 'reward';
    d.innerHTML = `<div class="ri">${icon}</div><div class="rv">${val}</div><div class="rl">${label}</div>`;
    ro.appendChild(d);
  };
  if (res.gained.gold) add(ic('coin'), formatNum(res.gained.gold), 'Gold');
  if (res.gained.xp) add(ic('spark'), formatNum(res.gained.xp), 'Experience');
  if (res.gained.scroll) add(ic('scroll'), res.gained.scroll, 'Scrolls');
  if (res.gained.shards) add(ic('crystal'), res.gained.shards, 'Shards');
  for (const k in res.gained.mats) add(ic('crate'), res.gained.mats[k], k);
  if (!ro.children.length) add('—', '', 'Nothing gained');
  box.querySelector('#done').onclick = () => { UI.close(); UI.refresh?.(); };
}

function sceneBg(scene) {
  return {
    forest: 'radial-gradient(70% 90% at 50% 30%, #2f4a2a, #0b0d10 80%)',
    ruins: 'radial-gradient(70% 90% at 50% 30%, #3a3a34, #0b0d10 80%)',
    waste: 'radial-gradient(70% 90% at 50% 30%, #5a3a24, #0b0d10 80%)',
    crypt: 'radial-gradient(70% 90% at 50% 30%, #2a3440, #08090c 80%)',
    spire: 'radial-gradient(70% 90% at 50% 30%, #3a2f56, #08090c 80%)',
  }[scene] || 'radial-gradient(70% 90% at 50% 30%, #2a2f24, #0b0d10 80%)';
}

/* ==========================================================================
   CACHES & ENDLESS
   ========================================================================== */

function openCache(node, reg, ui) {
  const rewards = node.rewards || {};
  const mult = State.bonuses.materialMult;
  UI.confirm(node.name, esc(node.intro || 'A cache.') + '<br><br>' +
    Object.entries(rewards.mats || {}).map(([k, v]) => `${k} ×${Math.round(v * mult)}`).join(' · ') +
    (rewards.gold ? ` · ${ic('coin')} ${rewards.gold}` : ''),
    () => {
      State.addGold(rewards.gold || 0, 'cache');
      for (const k in (rewards.mats || {})) State.addResource(k, Math.round(rewards.mats[k] * mult), 'cache');
      State.clearNode(node.id, { nodeId: node.id });
      audio.play('coin');
      UI.toast('Cache emptied', 'good', ic('crate'));
      ui.refresh();
    }, 'Take it');
}

function openEndless(node, reg, ui) {
  const best = State.s.endless.best;
  const wave = best + 1;
  const w = endlessWave(wave);
  UI.confirm('The Endless War',
    `Wave <b>${wave}</b> — level ${w.level}, factions: ${w.factions.join(' + ')}${w.modifiers.length ? `, ${w.modifiers.join(', ')}` : ''}.<br><br>
     Best reached: <b>${best}</b>. Rewards scale with the wave you clear.`,
    () => {
      UI.closeAll();
      UI.onStartBattle?.({ node, region: reg, endless: wave });
    }, 'Fight');
}

/* ---------------------------------------------------------- tooltips */

UI.addTipProvider((key) => {
  if (!key.startsWith('node:')) return null;
  const found = findNode(key.slice(5));
  if (!found) return null;
  const n = found.node;
  const f = FACTIONS[n.faction];
  const cleared = State.nodeCleared(n.id);
  return `<h4>${nodeIcon(n)} ${esc(n.name)}</h4>
    <div class="tip-sub">${n.type}${n.level ? ` · level ${n.level}` : ''}${cleared ? ' · cleared' : ''}</div>
    <div>${esc(n.intro || n.desc || '')}</div>
    ${f ? `<div style="margin-top:6px"><em>${f.icon} ${f.name}</em></div>` : ''}
    ${n.mechanic ? `<div style="margin-top:6px;color:var(--gold)">${esc(n.mechanic)}</div>` : ''}`;
});
