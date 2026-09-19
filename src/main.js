/* main.js — the application.

   Owns the renderer, the two modes (hub and battle), the camera rigs and the
   frame loop. Everything else is a system it drives.

   Modes:
     HUB     you walk around the keep; UI screens open over it
     BATTLE  the sim runs; two camera rigs (tactical / commander) and the HUD
*/

import * as THREE from '../lib/three.module.js';
import { CFG, BUILD } from './core/Config.js';
import { input } from './core/Input.js';
import { audio } from './core/Audio.js';
import { bus, EV } from './core/Bus.js';
import { State } from './game/State.js';
import { Save } from './core/Save.js';
import { clamp, clamp01, damp, lerp, TAU, Rolling, angleDelta, formatTime } from './core/Util.js';

import { CameraRig } from './core/CameraRig.js';
import { SkyRig, LightPool } from './art/Sky.js';
import { FXSystem } from './art/FX.js';
import { PostFX } from './art/PostFX.js';
import { MATS, PAL } from './art/Palette.js';

import { UI } from './ui/UI.js';
import { BattleHud } from './ui/BattleHud.js';
import { ScreenArmy } from './ui/ScreenArmy.js';
import { ScreenLibrary } from './ui/ScreenLibrary.js';
import { ScreenForge } from './ui/ScreenForge.js';
import { ScreenEquip } from './ui/ScreenEquip.js';
import { ScreenMap, openBriefing } from './ui/ScreenMap.js';
import { ScreenResults } from './ui/ScreenResults.js';
import { ScreenShop } from './ui/ScreenShop.js';

import { Hub } from './world/Hub.js';
import { closeDialogue, dialogueOpen } from './world/NPCs.js';
import { Tutorial } from './game/Tutorial.js';
import { Objective } from './ui/Objective.js';

import { Battle } from './battle/Battle.js';
import { wireQuests, processBattleResult } from './game/Progression.js';
import { UNITS } from './data/Units.js';
import { POTIONS } from './data/Items.js';
import { REGIONS, findNode, endlessWave } from './data/Campaign.js';
import { FACTIONS } from './data/Factions.js';
import { Thumbs } from './ui/Thumbs.js';

/* ========================================================================== */

class Game {
  constructor() {
    this.mode = 'boot';
    this.frame = new Rolling(40);
    this.clock = new THREE.Clock();
    this.t = 0;
  }

  /* ------------------------------------------------------------- boot */

  async boot() {
    const bar = document.getElementById('boot-bar');
    const text = document.getElementById('boot-text');
    const step = (p, s) => { bar.style.width = p + '%'; text.textContent = s; return new Promise(r => setTimeout(r, 16)); };

    await step(8, 'WAKING THE RENDERER');
    this._initRenderer();

    await step(24, 'READING THE SAVE');
    State.init();
    wireQuests();
    Tutorial.init();

    await step(40, 'LIGHTING THE SKY');
    this.sky = new SkyRig(this.scene);
    this.fx = new FXSystem(this.scene);
    // 14 real lights, assigned each frame to the nearest/brightest of however
    // many sources a zone declares. The Library declares about thirty.
    this.lights = new LightPool(this.scene, 14);

    await step(58, 'BUILDING THE INTERFACE');
    UI.init();
    UI.onStartBattle = (o) => this.startBattle(o);
    UI.onReturnHub = () => this.returnToHub();
    UI.onSetting = (k, v) => this._applySetting(k, v);

    await step(74, 'RAISING THE KEEP');
    this.hub = new Hub({ scene: this.scene, camera: this.camera, cam: this.cam, sky: this.sky, fx: this.fx, lights: this.lights });
    this.hub.onAction = (a) => this.handleAction(a);

    await step(88, 'DRAWING THE CARDS');
    // warm the portrait cache for the deck so the first screen open is instant
    for (const id of State.s.deck) Thumbs.get(id, State.card(id)?.level || 1);

    await step(100, 'READY');

    this._applySettings();
    this._wireInput();
    this._wireEvents();

    setTimeout(() => {
      document.getElementById('boot').classList.add('gone');
      this.enterHub(true);
      if (State.s.flags.firstRun) this._firstRun();
    }, 350);

    this.mode = 'hub';
    this.clock.start();
    this._loop();
  }

  _initRenderer() {
    const canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(CFG.render.maxPixelRatio, devicePixelRatio || 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // PostFX does the tonemap

    this.scene = new THREE.Scene();
    // Placement is CameraRig's job, including the very first frame — there is
    // no "just this once" exception, or there are two systems again.
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 700);

    this.post = new PostFX(this.renderer, { enabled: true });
    this.post.setSize(innerWidth * this.renderer.getPixelRatio(), innerHeight * this.renderer.getPixelRatio());

    // The one camera controller. Nothing else in the game writes to
    // `camera.position` or `camera.rotation`.
    this.cam = new CameraRig(this.camera);

    input.attach(canvas);
    addEventListener('resize', () => this._resize());
    this._resize();

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  _applySettings() {
    const s = State.s.settings;
    audio.setVolume('master', s.master);
    audio.setVolume('sfx', s.sfx);
    audio.setVolume('music', s.music);
    this._applySetting('bloom', s.bloom);
    this._applySetting('shadows', s.shadows);
    this._applySetting('brightness', s.brightness ?? 1);
    this._applySetting('lookSensitivity', s.lookSensitivity ?? 1);
    this._applySetting('invertY', s.invertY ?? false);
    this._applySetting('cameraShake', s.cameraShake !== false);
  }

  _applySetting(k, v) {
    if (k === 'bloom') this.post.enabled = !!v;
    if (k === 'shadows') {
      this.renderer.shadowMap.enabled = !!v;
      this.scene.traverse(o => { if (o.isMesh) o.material && (o.material.needsUpdate = true); });
    }
    if (k === 'brightness') this.post.exposure = CFG.render.exposure * v;
    if (k === 'lookSensitivity') this.cam.sensitivity = v;
    if (k === 'invertY') this.cam.invertY = !!v;
    if (k === 'cameraShake') this.cam.shakeEnabled = !!v;
  }

  /* --------------------------------------------------------------- input */

  _wireInput() {
    addEventListener('keydown', e => {
      // the audio context needs a gesture; this is the earliest reliable one
      audio.init();
      if (e.code === 'Escape') {
        // The browser releases pointer lock on Escape itself. Everything below
        // reacts to that release rather than racing it.
        if (dialogueOpen()) { closeDialogue(); return; }
        if (UI.isOpen) { UI.close(); return; }
        if (this.mode === 'battle') this._battleMenu();
        else UI.openOptions();
      }
    });

    /* ------------------------------------------------------ pointer lock
       Click the world to take camera control; Escape or any menu gives it
       back. This is the single rule that stops the camera moving while the
       player is using the interface. */
    this.renderer.domElement.addEventListener('mousedown', () => {
      audio.init();
      if (!UI.isOpen && !dialogueOpen()) input.requestLock();
    });

    input.onLockChange(locked => {
      document.body.classList.toggle('locked', locked);
      this._updateCrosshair();
      if (!locked) this._showLockHint();
    });

    // A menu opening must always release the mouse; closing it hands control
    // back only if the player had it before.
    bus.on(EV.SCREEN_OPEN, () => { this._hadLock = input.pointerLocked; input.releaseLock(); });
    bus.on(EV.SCREEN_CLOSE, () => {
      // Re-locking needs a user gesture, so we only arm the hint; the next
      // click on the world re-engages. Silently failing to re-lock is exactly
      // the sort of input-lock bug we are trying to avoid.
      if (!UI.isOpen) this._showLockHint();
    });
  }

  /** A small, permanent prompt telling the player how to take camera control. */
  _showLockHint() {
    if (this.mode === 'boot') return;
    let el = document.getElementById('lockhint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lockhint';
      el.className = 'lockhint';
      el.innerHTML = '<span class="k">Click</span> to take camera control · <span class="k">Esc</span> to release';
      document.getElementById('ui').appendChild(el);
    }
    el.classList.remove('hidden');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  _updateCrosshair() {
    let el = document.getElementById('crosshair');
    if (!el) {
      el = document.createElement('div');
      el.id = 'crosshair';
      el.className = 'crosshair hidden';
      el.innerHTML = '<span></span>';
      document.getElementById('ui').appendChild(el);
    }
    const want = this.mode === 'battle' && input.pointerLocked && !UI.isOpen;
    el.classList.toggle('hidden', !want);
  }

  _wireEvents() {
    bus.on(EV.STATE_CHANGED, () => this.hub?.refreshBadges());
    bus.on(EV.ITEM_EQUIPPED, () => { if (this.mode === 'hub') this.hub.refreshModel(); });
    bus.on(EV.CARD_UPGRADED, ({ id }) => Thumbs.invalidate(id));
  }

  /* ====================================================================== */
  /* HUB                                                                     */
  /* ====================================================================== */

  enterHub(instant) {
    this.mode = 'hub';
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    if (this.hud) { this.hud.destroy(); this.hud = null; }
    this.fx.clear();
    this.hub.enter(State.s.flags.lastZone || 'keep', { instant });
    input.blocked = false;
    this._updateCrosshair();
    this._showLockHint();
  }

  returnToHub() {
    UI.closeAll();
    this.enterHub(false);
  }

  handleAction(action) {
    switch (action) {
      case 'map': UI.open(ScreenMap, { region: State.s.currentRegion }); break;
      case 'army': UI.open(ScreenArmy, { tab: 'deck' }); break;
      case 'collection': UI.open(ScreenArmy, { tab: 'collection' }); break;
      case 'challenges': UI.open(ScreenArmy, { tab: 'challenges' }); break;
      case 'equip': UI.open(ScreenEquip); break;
      case 'shop': UI.open(ScreenShop); break;
      case 'openShop': UI.open(ScreenShop); break;

      case 'library': this._goZoneOrScreen('library', ScreenLibrary, { tab: 'upgrade' }); break;
      case 'forge': this._goZoneOrScreen('forge', ScreenForge, { tab: 'craft' }); break;

      case 'openCardUpgrade': UI.open(ScreenLibrary, { tab: 'upgrade' }); break;
      case 'openResearch': case 'research': UI.open(ScreenLibrary, { tab: 'research' }); break;
      case 'openAlchemy': case 'alchemy': UI.open(ScreenLibrary, { tab: 'alchemy' }); break;
      case 'openAwaken': case 'awaken': UI.open(ScreenLibrary, { tab: 'awaken' }); break;
      case 'codex': case 'counters': case 'openCounters': UI.open(ScreenLibrary, { tab: 'codex' }); break;

      case 'openForge': UI.open(ScreenForge, { tab: 'craft' }); break;
      case 'openUpgradeGear': case 'temper': UI.open(ScreenForge, { tab: 'upgrade' }); break;
      case 'openArmy': UI.open(ScreenArmy, { tab: 'deck' }); break;
      case 'openCollection': UI.open(ScreenArmy, { tab: 'collection' }); break;
      case 'openTraining': case 'training': this.startTraining(); break;
      default: break;
    }
  }

  /** Dock buttons walk you to the room; being in the room opens the screen. */
  _goZoneOrScreen(zone, screen, args) {
    if (this.hub.zoneId === zone) UI.open(screen, args);
    else this.hub.transitionTo(zone);
  }

  /**
   * The first thing a new player sees. It covers the CONTROLS only — the two
   * things they cannot discover by trying, and nothing else. Every question
   * about what the game is, what a card does, or where to go next is answered
   * by the Marshal, in the world, at the moment it matters.
   *
   * The old version of this screen tried to explain the whole game in one
   * box and then dropped the player into a courtyard with no objective.
   */
  _firstRun() {
    State.setFlag('firstRun', false);
    UI.overlay(`
      <div class="h-rule"><h2>Crownfall</h2></div>
      <div style="font-size:15px;line-height:1.8;color:var(--vel-1)">
        The Greenmarch is gone, the Crown is in pieces, and you have three cards and a borrowed sword.
        <div class="firstkeys mt16">
          <div><span class="kbd">Click</span> take camera control — then just move the mouse<br><span class="muted">Esc gives the mouse back whenever you need it</span></div>
          <div><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> walk &nbsp; <span class="kbd">Shift</span> run &nbsp; <span class="kbd">E</span> interact</div>
        </div>
        <div class="mt16 muted" style="font-style:italic">Marshal Corr is at the war table. She will take it from there.</div>
      </div>
      <div class="rowflex mt16" style="justify-content:space-between;align-items:center">
        <div class="btn ghost sm" data-skip>Skip the tutorial</div>
        <div class="btn gold lg" data-ok>Take command</div>
      </div>
    `, (el, close) => {
      el.querySelector('[data-ok]').onclick = () => { audio.init(); audio.play('horn'); close(); };
      el.querySelector('[data-skip]').onclick = () => {
        audio.init();
        UI.confirm('Skip the tutorial?',
          'You can ask Marshal Corr to explain any of it at the war table, at any time.',
          () => { Tutorial.skip(); close(); }, 'Skip');
      };
    });
  }

  /* ====================================================================== */
  /* BATTLE                                                                  */
  /* ====================================================================== */

  startBattle({ node, region, endless, training }) {
    UI.closeAll();
    this.hub.exit();
    State.s.flags.lastZone = this.hub.zoneId || 'keep';
    this.mode = 'battle';
    this.fx.clear();
    this.lights.releaseAll();

    /* ---- the player's side ---- */
    const deck = State.s.deck.map(id => {
      const save = State.card(id);
      return { id, unit: UNITS[id], level: save?.level || 1, awakened: !!save?.awakened };
    }).filter(c => c.unit);

    const potions = State.s.potionSlots
      .filter(Boolean)
      .map(id => ({ id, count: State.s.potions[id] || 0 }));

    /* ---- the enemy ---- */
    let enemy, field, atmos, subtitle;
    if (endless) {
      const w = endlessWave(endless);
      const facs = w.factions.map(f => FACTIONS[f]);
      enemy = {
        faction: w.factions[0],
        deck: facs.flatMap(f => f.roster).filter(Boolean),
        level: w.level,
        modifiers: w.modifiers,
        commanderStats: enemyCommanderStats(w.level),
        commanderName: 'Warden of the Endless',
      };
      field = 'spire'; atmos = 'stormspire';
      subtitle = 'Wave ' + endless;
    } else if (training) {
      enemy = {
        faction: 'goblin', deck: ['goblinCutter', 'goblinArcher', 'goblinShaman'],
        level: Math.max(1, State.s.level - 2), modifiers: [],
      };
      field = 'open'; atmos = 'greenmarch'; subtitle = 'Sparring';
    } else {
      enemy = {
        faction: node.faction, deck: node.enemyDeck || [], level: node.level || 1,
        boss: node.boss, modifiers: node.modifiers || [],
        // A node with `waves` is a teaching battle: Battle swaps the free-form
        // enemy director for the scripted one.
        waves: node.waves, waveLeadIn: node.waveLeadIn,
        commanderStats: node.type === 'boss' ? null : null,
      };
      field = node.field || 'open';
      atmos = region?.id || 'greenmarch';
      subtitle = region?.name || '';
      for (const u of enemy.deck) State.seeUnit(u);
    }

    this.sky.apply(atmos, true);
    this.sky.addClouds(0xffffff, 10);

    this.battle = new Battle({
      scene: this.scene, fx: this.fx,
      field, atmos,
      playerDeck: deck,
      playerName: State.s.name,
      playerStats: State.commanderStats(),
      playerEquipped: State.equippedIds(),
      playerAbilities: State.commanderAbilities(),
      playerPotions: potions,
      enemy,
      node: training ? null : node,
      regionId: region?.id,
      bonuses: State.bonuses,
      endlessWave: endless,
      damageNumbers: State.s.settings.damageNumbers,
      cameraShake: State.s.settings.cameraShake,
      postfx: this.post,
      subtitle,
      structureHpMult: endless ? 1 + endless * 0.08 : 1,
      onEvent: (e) => this._battleEvent(e),
    });

    this.hud = new BattleHud(this.battle, this.camera);

    // Start looking DOWN the field at the enemy. The old rig put the camera on
    // the far side facing back at your own banner, with the enemy off-screen
    // behind you — which is most of why battles were unplayable.
    this.camView = 'tactical';
    const f = this.battle.field;
    this.cam.setBounds({ x0: -f.W / 2 - 6, x1: f.W / 2 + 6, z0: -f.L / 2 - 10, z1: f.L / 2 + 10 });
    this.cam.setProbe((x, z) => f.heightAt(x, z));
    // banners and towers are tall solid monuments; standing beside one used to
    // put the camera inside it
    this.cam.setBlockers(this.battle.allStructures.map(s => ({
      x: s.x, z: s.z, r: (s.kind === 'banner' ? 4.2 : 2.6),
    })));
    this.cam.reset({
      x: this.battle.player.x, y: 0, z: this.battle.player.z,
      yaw: 0,                      // yaw 0 faces +Z, and the enemy is at +Z
      preset: 'tactical',
    });
    UI.showTopbar(false);
    input.blocked = false;
    this._updateCrosshair();
    this._showLockHint();

    audio.setMusic(node?.type === 'boss' ? 'boss' : 'battle');

    // the objective tracker follows you into the fight
    if (Tutorial.active) Tutorial.refresh();

    bus.emit(EV.BATTLE_START, {
      nodeId: node?.id || null, regionId: region?.id || null,
      training: !!training, endless: endless || 0,
    });

    // teach the node's lesson before the fight, not after
    if (node?.tutorial) setTimeout(() => this.hud.showTutorial(node.tutorial), 900);
  }

  startTraining() {
    if (!State.deckValid()) { UI.toast(`Your army needs at least ${CFG.army.minDeck} cards`, 'bad'); return; }
    this.startBattle({ training: true, region: { id: 'greenmarch', name: 'Training Ground' } });
  }

  _battleEvent(e) {
    if (!this.hud) return;
    if (e.kind === 'log') this.hud.pushLog(e.text, e.team);
    else if (e.kind === 'callout') this.hud.callout(e.big, e.small);
    else if (e.kind === 'teach') this.hud.showTeach(e.text);
    else if (e.kind === 'synergies') this.hud.setSynergies(e.list);
    else if (e.kind === 'end') this._endBattle(e.result);
  }

  _endBattle(result) {
    audio.setMusic(result.victory ? 'victory' : 'map');
    this.post.pulse(result.victory ? 0xffd479 : 0x8e2018, 0.35);
    UI.callout(result.victory ? 'VICTORY' : 'DEFEAT', result.victory ? 'The field is yours' : 'Fall back', 2200);

    setTimeout(() => {
      const summary = processBattleResult(result);
      this.hud?.destroy();
      this.hud = null;
      UI.showTopbar(true);
      UI.open(ScreenResults, { summary, result });
    }, 2300);
  }

  _battleMenu() {
    UI.overlay(`
      <div class="h-rule"><h2>Paused</h2></div>
      <div class="sub" style="font-style:normal">The battle continues while this is open — it is a real-time fight.</div>
      <div class="col mt16">
        <div class="btn wide" data-r>Resume</div>
        <div class="btn wide ghost" data-o>Options</div>
        <div class="btn wide danger" data-f>Withdraw</div>
      </div>`, (el, close) => {
      el.querySelector('[data-r]').onclick = () => { audio.play('ui.click'); close(); };
      el.querySelector('[data-o]').onclick = () => { close(); UI.openOptions(); };
      el.querySelector('[data-f]').onclick = () => {
        close();
        UI.confirm('Withdraw?', 'You forfeit the battle and take reduced rewards.', () => this.battle?.forfeit(), 'Withdraw');
      };
    });
  }

  /* ---------------------------------------------------------- battle input */

  _battleIntent(dt) {
    const b = this.battle;
    const blocked = UI.isOpen;
    input.blocked = blocked;

    /* ------------------------------------------------------------ camera
       Exactly as in the hub: look first, then derive movement from the
       orientation the player can see THIS frame. */
    if (blocked) {
      this.cam.settleTargets();
    } else {
      const look = input.lookDelta();
      this.cam.look(look.x, look.y);
      if (input.mouse.wheel) this.cam.zoom(input.mouse.wheel);
      if (input.pressed('Tab')) {
        this.camView = this.camView === 'tactical' ? 'commander' : 'tactical';
        this.cam.applyPreset(this.camView, false);   // keeps the player's yaw
        audio.play('ui.click');
      }
    }
    // The camera always follows the commander. It used to chase the centroid
    // of every living unit, so it wandered off on its own while the player was
    // trying to aim -- that was "the camera drifts by itself".
    this.cam.setFocus(b.player.x, 0, b.player.z);
    this.cam.shakeEnabled = State.s.settings.cameraShake !== false;
    this.cam.addShake(b.consumeShake());
    this.cam.update(dt);

    /* ------------------------------------------------------------- keys */
    if (!blocked) {
      for (let i = 0; i < 5; i++) {
        if (input.pressed('Digit' + (i + 1))) this.hud.arm(i);
      }
    }

    /* ----------------------------------------------------------- aiming
       Locked: the crosshair at the centre of the screen. Unlocked: the
       cursor. One function, so deploying and attacking always agree. */
    const ground = this._pickGround();
    if (!blocked && input.clicked[0] && this.hud.armed !== null && ground) {
      this.hud.tryDeploy(ground.x, ground.z);
      return IDLE;
    }
    if (!blocked && input.clicked[2]) this.hud.arm(null);
    this.hud.setAim(ground, this.hud.armed !== null && !blocked);

    /* ------------------------------------------------- commander intent */
    const mv = blocked ? { x: 0, y: 0 } : input.moveAxis();
    const world = this.cam.moveVector(mv.x, mv.y);

    let ability = null;
    if (!blocked) {
      if (input.pressed('KeyQ')) ability = 0;
      if (input.pressed('KeyE')) ability = 1;
      if (input.pressed('KeyR')) ability = 2;
    }
    let potion = null;
    if (!blocked) {
      if (input.pressed('KeyZ')) potion = 0;
      if (input.pressed('KeyX')) potion = 1;
      if (input.pressed('KeyC')) potion = 2;
    }

    return {
      moveX: world.x, moveZ: world.z,
      aimX: ground ? ground.x : b.player.x + Math.cos(b.player.facing),
      aimZ: ground ? ground.z : b.player.z + Math.sin(b.player.facing),
      attack: !blocked && this.hud.armed === null && input.buttons[0] && !input.overUI,
      attackReleased: !blocked && input.released[0],
      dodge: !blocked && input.pressed('Space'),
      ability, potion,
    };
  }

  /**
   * The world point the player is aiming at. Under pointer lock that is the
   * crosshair at the centre of the screen; otherwise it is the cursor.
   */
  _pickGround() {
    const ndc = input.pointerLocked
      ? { x: 0, y: 0 }
      : { x: input.mouse.nx, y: input.mouse.ny };
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    if (!isFinite(hit.x) || !isFinite(hit.z)) return null;
    return { x: hit.x, z: hit.z };
  }

  /* ====================================================================== */
  /* LOOP                                                                    */
  /* ====================================================================== */

  _loop() {
    requestAnimationFrame(() => this._loop());
    let dt = this.clock.getDelta();
    if (dt > 0.1) dt = 0.1;          // a tab that was backgrounded must not teleport the sim
    this.t += dt;
    this.frame.push(dt);

    try {
      if (this.mode === 'hub') {
        this.hub.update(dt);
      } else if (this.mode === 'battle' && this.battle) {
        // _battleIntent drives the camera rig and returns the commander's
        // intent from it, so the camera is already placed for this frame.
        const intent = this.hud ? this._battleIntent(dt) : IDLE;
        this.battle.update(dt, intent);
        this.sky.update(dt, this.camera.position.x, this.camera.position.z);
        this.hud?.update(dt);
        this.lights.update(dt, this.t);
      }

      UI.update(dt);
      // the Marshal waits for a quiet moment rather than interrupting
      Tutorial.update(dt, { uiOpen: UI.isOpen, delay: this.mode === 'battle' ? 2.4 : 0.9 });
      State.tick(dt);
      this.post.update(dt);
      this.post.render(this.scene, this.camera);
    } catch (e) {
      console.error('[frame]', e);
      // one bad frame should not end the session
    }

    input.endFrame();
  }
}

const IDLE = {
  moveX: 0, moveZ: 0, attack: false, attackReleased: false,
  dodge: false, ability: null, potion: null,
};

/** A plausible enemy commander for endless mode. */
function enemyCommanderStats(level) {
  return {
    level, maxHp: 700 + level * 60, might: 30 + level * 3, focus: 24 + level * 2.4,
    armor: 10 + level, haste: level * 2, weight: 14,
    moveSpeed: 7.4, atkSpeedMult: 1 + level / 200, cdr: 0.1,
    specials: {}, weaponClass: 'greatsword', raw: {},
  };
}

/* -------------------------------------------------------------------------- */

const game = new Game();
window.__ironcrown = game;   // a handle for the console; harmless in release
game.boot().catch(e => {
  console.error('[boot]', e);
  document.getElementById('boot-text').textContent = 'FAILED TO START — see the console';
});
