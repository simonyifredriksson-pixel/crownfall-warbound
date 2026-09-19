/* ScreenDrill.js — the drill ground.

   Where formations are LEARNED. Each one shows what it actually looks like
   (drawn from the same `slots()` the battle uses, so the diagram cannot drift
   out of step with the formation), what it is good at, and what it costs you.

   The screen exists because a formation nobody has read about is a keypress
   that does something mysterious. Here you can see the shape, read the trade,
   and decide whether it is worth eighteen hundred gold.
*/

import { State } from '../game/State.js';
import { UI } from './UI.js';
import { audio } from '../core/Audio.js';
import { bus, EV } from '../core/Bus.js';
import { FORMATION_LIST, getFormation } from '../data/Formations.js';
import { esc, formatNum } from '../core/Util.js';
import { ic } from '../art/Icons.js';
import { section, empty } from './Widgets.js';

/** Draw a formation's actual slot layout as an SVG diagram. */
function diagram(f, n = 8, size = 128) {
  const slots = f.slots(n);
  let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const s of slots) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const pad = 1.6;
  const w = (maxX - minX) + pad * 2, h = (maxZ - minZ) + pad * 2;
  const scale = Math.min(size / w, size / h);
  const ox = size / 2 - ((minX + maxX) / 2) * scale;
  // +Z is "forward"; on screen forward is UP, so z is negated
  const oy = size / 2 + ((minZ + maxZ) / 2) * scale;

  const dots = slots.map((s, i) => {
    const cx = ox + s.x * scale;
    const cy = oy - s.z * scale;
    // the leading rank is picked out, so you can see which way it faces
    const lead = s.z >= maxZ - 0.01;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(scale * 0.42).toFixed(1)}" class="${lead ? 'lead' : ''}"/>`;
  }).join('');

  return `<svg class="formdiag" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <path class="facing" d="M${size / 2 - 7} 13 L${size / 2} 4 L${size / 2 + 7} 13 Z"/>
    ${dots}
  </svg>`;
}

export const ScreenDrill = {
  id: 'drill',

  build(el, args, ui) {
    const parts = ui.scaffold(el, {
      icon: ic('angle'),
      title: 'The Drill Ground',
      blurb: 'Captain Roon: "An army that cannot change shape is a crowd that happens to be armed."',
    });

    const body = parts.body;
    body.appendChild(section('Formations',
      'Press F in battle to cycle through the formations you know. Orders — follow, hold, advance, charge — are given with V, G, B and N.'));

    const grid = document.createElement('div');
    grid.className = 'drillgrid';
    body.appendChild(grid);

    for (const f of FORMATION_LIST) {
      const known = !f.unlock || State.knowsDrill(f.unlock);
      const cost = f.unlock ? State.drillCost(f) : null;
      const afford = cost ? State.canAfford(cost) : true;

      const card = document.createElement('div');
      card.className = 'drillcard' + (known ? ' known' : '') + (known || afford ? '' : ' poor');
      card.innerHTML = `
        <div class="dc-art">${diagram(f, 8)}</div>
        <div class="dc-body">
          <div class="dc-head">
            <h3>${esc(f.name)}</h3>
            ${known ? `<span class="chip on">${ic('check')} Drilled</span>` : '<span class="chip">Not drilled</span>'}
          </div>
          <div class="dc-blurb">${esc(f.blurb)}</div>
          <p class="dc-desc">${esc(f.desc)}</p>
          <div class="dc-trade">
            <div class="good"><b>Strong:</b> ${esc(f.good)}</div>
            <div class="bad"><b>Weak:</b> ${esc(f.bad)}</div>
          </div>
          <div class="dc-stats">
            <span>March speed <b>${Math.round((f.speed ?? 1) * 100)}%</b></span>
            ${modLabels(f).map(m => `<span>${m}</span>`).join('')}
          </div>
          <div class="dc-foot"></div>
        </div>`;

      const foot = card.querySelector('.dc-foot');
      if (!known) {
        foot.innerHTML = `
          <div class="dc-quote">${esc(f.drillText || '')}</div>
          <div class="rowflex" style="justify-content:space-between;align-items:center;margin-top:8px">
            <span class="matlist">
              <span class="mat${State.s.gold >= cost.gold ? '' : ' short'}">${ic('coin')} ${formatNum(cost.gold)}</span>
              <span class="mat${State.s.scroll >= cost.scroll ? '' : ' short'}">${ic('scroll')} ${cost.scroll}</span>
            </span>
            <div class="btn ${afford ? 'gold' : 'ghost'}" data-learn="${f.unlock}">Drill the army</div>
          </div>`;
        foot.querySelector('[data-learn]').addEventListener('click', () => {
          if (!State.canAfford(cost)) { audio.play('ui.deny'); UI.toast('You cannot pay for that drill', 'bad'); return; }
          if (State.learnDrill(f.unlock, cost)) {
            audio.play('horn');
            UI.toast(`${f.name} — drilled`, 'good', f.icon);
            ui.refresh();
          }
        });
      }
      grid.appendChild(card);
    }
  },
};

/** Turn a formation's mods into short readable labels. */
function modLabels(f) {
  const m = f.mods || {};
  const out = [];
  if (m.frontalTakenMult) out.push(`Frontal damage taken <b>${Math.round((1 - m.frontalTakenMult) * 100)}% less</b>`);
  if (m.rangedTakenMult) out.push(`Missiles <b>${Math.round((1 - m.rangedTakenMult) * 100)}% less</b>`);
  if (m.splashTakenMult) out.push(`Splash <b>${Math.round((1 - m.splashTakenMult) * 100)}% less</b>`);
  if (m.dmgTakenMult && m.dmgTakenMult > 1) out.push(`Damage taken <b>+${Math.round((m.dmgTakenMult - 1) * 100)}%</b>`);
  if (m.chargeMult) out.push(`Charge impact <b>+${Math.round((m.chargeMult - 1) * 100)}%</b>`);
  if (m.rangeMult) out.push(`Range <b>+${Math.round((m.rangeMult - 1) * 100)}%</b>`);
  if (m.noFlank) out.push('<b>Cannot be flanked</b>');
  if (m.ccResist) out.push('<b>Resists knockback</b>');
  return out;
}
