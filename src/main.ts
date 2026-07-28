import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from './three/engine';
import { CameraRig } from './three/rig';
import { buildStage, type StageHandles } from './three/stage';
import { PLINTH_HEIGHT, plinthPositions } from './config/layout';
import { LoadingPlinth } from './three/loading';
import {
  applyVariantTint,
  createGlbChampion,
  GlbChampion,
  initCharacterLoader,
  loadNormalized,
  loadRawModel,
  type ChampionView,
} from './three/champions';
import { Picker } from './three/picking';
import { createRevealFx, type RevealFx } from './three/reveal';
import { Nameplate } from './three/nameplate';
import { FactionBackdrop } from './three/backdrop';
import { WaifuStage } from './three/waifu-stage';
import { openingLine, speakingDuration } from './chat/engine';
import { getReply } from './chat/client';
import { cancelSpeech, renderSpeech } from './chat/voice';
import { residentById, type ResidentId } from './config/residents';
import { Ambience } from './audio/ambience';
import { FREE_TURNS, store, type SessionSetup, type Step } from './state/store';
import { mountUI } from './ui/overlay';
import type { UIActions } from './ui/actions';
import { CAMERA_PRESETS } from './config/cameras';
import { COPY } from './config/copy';
import { factionById } from './config/factions';
import { CHARACTERS, characterById, characterIndex } from './config/characters';
import { universeById } from './config/universes';
import { fnv1a } from './util/hash';

const PLINTHS = plinthPositions(CHARACTERS.length);

/** Horizontal angle the stage preset frames her from. */
const STAGE_AZIMUTH = Math.atan2(CAMERA_PRESETS.stage.pos[0], CAMERA_PRESETS.stage.pos[2]);

/** Half of the 120-degree arc a visitor may inspect for free. */
const FREE_ARC = Math.PI / 3;

class App implements UIActions {
  private engine: Engine;
  private rig: CameraRig;
  private controls: OrbitControls;
  private stage: StageHandles;
  private picker: Picker;
  private ambience = new Ambience();
  private nameplate: Nameplate;
  private backdrop!: FactionBackdrop;

  private views = new Map<string, ChampionView>();
  private liftTargets = new Map<string, number>();
  private hoveredId: string | null = null;
  private mate: ChampionView | null = null;
  private revealFx: RevealFx | null = null;

  private rimA!: THREE.SpotLight;
  private rimB!: THREE.SpotLight;
  private rimTarget = 0;
  private selectedId: string | null = null;

  private residentStage: WaifuStage | null = null;
  private speakTimer = 0;

  private photoSeed = 0;
  private genTimer = 0;
  private portalActivation = 0;
  private portalTarget = 0.12;
  /** Height of the loaded center base's top surface (Mate stands here). */
  private centerTopY = 0.09;
  private errorTimer = 0;

  constructor() {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    this.engine = new Engine(canvas);
    initCharacterLoader(this.engine.renderer);
    this.rig = new CameraRig(this.engine.camera, this.engine.reducedMotion);

    this.controls = new OrbitControls(this.engine.camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.7;
    this.controls.maxDistance = 5.2;
    this.controls.minPolarAngle = 0.7;
    this.controls.maxPolarAngle = 1.52;
    this.rig.attachControls(this.controls);

    // The shared physical set (floor, base, plinths, portal beam) is built
    // once; each universe decides what stands on it.
    this.stage = buildStage(
      this.engine.scene,
      universeById('afterburn-city'),
      CHARACTERS.map((c) => factionById(c.factionId).accentColor)
    );
    this.nameplate = new Nameplate(this.engine.scene);
    this.backdrop = new FactionBackdrop(this.engine.scene, [this.stage.skyline]);

    // Selection rim rig: two colored back-side lights that follow whatever is
    // in focus (selected plinth, then the Mate) so figures pop off the pano.
    this.rimA = new THREE.SpotLight(0xffffff, 0, 16, Math.PI / 4, 0.9, 1.6);
    this.rimB = new THREE.SpotLight(0x6fa8ff, 0, 16, Math.PI / 4, 0.9, 1.6);
    for (const rim of [this.rimA, this.rimB]) {
      this.engine.scene.add(rim);
      this.engine.scene.add(rim.target);
    }

    this.watchOrbitLimit();
    this.picker = new Picker(canvas, this.engine.camera);
    this.picker.onHover = (id) => {
      this.hoveredId = id;
      this.updateLiftTargets();
    };
    this.picker.onPick = (id) => {
      const step = store.get().step;
      if (step === 'studio') this.selectCharacter(id);
      else if (step === 'stage') this.selectResident(id);
    };

    this.rig.applyPreset(CAMERA_PRESETS.gallery);
    window.addEventListener('resize', () => this.rig.refreshFov());
    this.engine.onUpdate((dt, t) => this.tick(dt, t));
    this.engine.start();

    // Gallery costs nothing but the center base: character models are only
    // fetched once a universe is opened.
    let booted = false;
    const off = this.engine.onUpdate(() => {
      if (booted) return;
      booted = true;
      window.setTimeout(() => {
        this.loadCenterBase();
        this.setPlinthsVisible(false);
        document.getElementById('boot')?.classList.add('is-done');
        off();
      }, 0);
    });

    store.subscribe((s, prev) => {
      if (s.characterId !== prev.characterId || s.step !== prev.step) this.updateLiftTargets();
      this.picker.enabled =
        !s.transitioning && (s.step === 'studio' || s.step === 'stage');
    });

    mountUI(document.getElementById('ui')!, store, this);
    window.addEventListener('error', () => this.flashError(COPY.errors.generic));

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__hm = {
        store,
        rig: this.rig,
        camera: this.engine.camera,
        engine: this.engine,
      };
    }
  }

  private loadQueue: string[] = [];
  private loadingCharacter = false;

  private buildCharacters(): void {
    CHARACTERS.forEach((c, i) => {
      const faction = factionById(c.factionId);
      const stage = new LoadingPlinth(faction);
      const [x, , z] = PLINTHS[i];
      stage.root.position.set(x, PLINTH_HEIGHT, z);
      this.engine.scene.add(stage.root);
      this.views.set(c.id, stage);
      this.liftTargets.set(c.id, 0);
    });
    this.refreshPickSet();
    // Characters stream in one at a time (selection jumps the queue) so the
    // first meaningful render never waits on eight parallel downloads.
    this.loadQueue = CHARACTERS.map((c) => c.id);
    this.pumpLoadQueue();
  }

  /** Move a character to the front of the download queue. */
  private prioritizeLoad(id: string): void {
    const i = this.loadQueue.indexOf(id);
    if (i > 0) {
      this.loadQueue.splice(i, 1);
      this.loadQueue.unshift(id);
    }
  }

  private pumpLoadQueue(): void {
    if (this.loadingCharacter) return;
    const id = this.loadQueue.shift();
    if (!id) return;
    this.loadingCharacter = true;
    const c = characterById(id);
    const faction = factionById(c.factionId);
    void createGlbChampion(faction, c.modelUrl)
      .then((champ) => {
        const current = this.views.get(id);
        if (!(current instanceof LoadingPlinth)) return;
        champ.root.position.copy(current.root.position);
        // Preserve any in-progress facing so the swap is seamless.
        if (this.selectedId === id) {
          const idx = characterIndex(id);
          const preset = CAMERA_PRESETS[`plinth-${idx}`];
          champ.setFacing(
            Math.atan2(preset.pos[0] - PLINTHS[idx][0], preset.pos[2] - PLINTHS[idx][2]),
            true
          );
        }
        this.engine.scene.add(champ.root);
        current.dispose();
        this.views.set(id, champ);
        this.refreshPickSet();
      })
      .catch(() => {
        console.warn(`Model missing for ${id}; loading stage stays until the GLB exists.`);
      })
      .finally(() => {
        this.loadingCharacter = false;
        this.pumpLoadQueue();
      });
  }

  /** Swap the placeholder center pedestal for the generated portal base. */
  private loadCenterBase(): void {
    void loadRawModel('assets/portal-base.glb')
      .then((base) => {
        const box = new THREE.Box3().setFromObject(base);
        const size = box.getSize(new THREE.Vector3());
        // Wide enough that a figure plus stand fits comfortably on top.
        const scale = Math.min(2.7 / Math.max(size.x, size.z), 0.34 / (size.y || 1));
        base.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(base);
        const center = box2.getCenter(new THREE.Vector3());
        base.position.x -= center.x;
        base.position.z -= center.z;
        base.position.y -= box2.min.y;
        base.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true;
        });
        this.engine.scene.add(base);
        this.centerTopY = box2.max.y - box2.min.y;
        this.stage.centerPedestal.visible = false;
        this.mate?.root.position.setY(this.centerTopY);
        this.residentStage?.setBaseTop(this.centerTopY);
      })
      .catch(() => {
        console.warn('Portal base GLB missing; placeholder pedestal stays.');
      });
  }

  private playVoice(id: string): void {
    this.ambience.playClip(`assets/voice/${id}.mp3`);
  }

  private refreshPickSet(): void {
    this.picker.setPickSet(
      CHARACTERS.flatMap((c) => {
        const v = this.views.get(c.id);
        return v ? [{ id: c.id, object: v.root }] : [];
      })
    );
  }

  private updateLiftTargets(): void {
    const s = store.get();
    for (const c of CHARACTERS) {
      const active =
        s.step === 'studio' && (c.id === s.characterId || c.id === this.hoveredId);
      this.liftTargets.set(c.id, active ? 0.055 : 0);
    }
  }

  private tick(dt: number, t: number): void {
    this.rig.update(dt);
    if (this.controls.enabled && !this.rig.flying) this.controls.update();
    this.stage.update(dt, t);
    this.picker.update();
    this.revealFx?.update(dt);
    this.nameplate.update(dt);
    this.backdrop.update(dt);

    this.portalActivation += (this.portalTarget - this.portalActivation) * Math.min(1, dt * 2.2);
    this.stage.setPortalActivation(this.portalActivation);

    let i = 0;
    for (const [id, fig] of this.views) {
      const target = this.liftTargets.get(id) ?? 0;
      fig.hoverLift += (target - fig.hoverLift) * Math.min(1, dt * 9);
      fig.updatePresentation(t, i * 2.1, dt);
      const spot = this.stage.plinthLights[i];
      if (spot) {
        const want = target > 0 ? 2.4 : 0.9;
        spot.intensity += (want - spot.intensity) * Math.min(1, dt * 3.5);
      }
      i++;
    }
    this.mate?.updatePresentation(t, 0.7, dt);
    this.residentStage?.update(t, dt);
    for (const rim of [this.rimA, this.rimB]) {
      rim.intensity += (this.rimTarget - rim.intensity) * Math.min(1, dt * 4);
    }
  }

  private flashError(msg: string): void {
    store.set({ error: msg });
    window.clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => store.set({ error: null }), 3500);
  }

  /** Aim the rim rig at a world point, tinted by the faction accent. */
  private placeRims(point: THREE.Vector3, camPos: THREE.Vector3, accent: number): void {
    const back = point.clone().sub(camPos);
    back.y = 0;
    back.normalize();
    const side = new THREE.Vector3(-back.z, 0, back.x);
    const focus = point.clone().setY(1.1);
    this.rimA.color.setHex(accent);
    this.rimA.position.copy(point).addScaledVector(back, 2.1).addScaledVector(side, 1.9).setY(2.5);
    this.rimA.target.position.copy(focus);
    this.rimB.position.copy(point).addScaledVector(back, 2.1).addScaledVector(side, -1.9).setY(2.5);
    this.rimB.target.position.copy(focus);
    this.rimTarget = 3.2;
  }

  private flyToCharacter(id: string, duration = 1.2): void {
    const idx = characterIndex(id);
    const preset = CAMERA_PRESETS[`plinth-${idx}`];
    const c = characterById(id);
    const faction = factionById(c.factionId);
    void this.backdrop.show(faction.id);
    const plinth = new THREE.Vector3(...PLINTHS[idx]).setY(0);
    const camPos = new THREE.Vector3(...preset.pos);
    this.nameplate.transitionTo(c.name, faction.accentColor, plinth, camPos);
    this.placeRims(plinth, camPos, faction.accentColor);

    // Turn the selected figure to face its camera; release the previous one.
    if (this.selectedId && this.selectedId !== id) {
      this.views.get(this.selectedId)?.setFacing(0);
    }
    this.selectedId = id;
    this.prioritizeLoad(id);
    const yaw = Math.atan2(camPos.x - plinth.x, camPos.z - plinth.z);
    this.views.get(id)?.setFacing(yaw);

    void this.rig.flyTo(preset, duration);
  }

  // ---------- Universe routing ----------

  private setPlinthsVisible(v: boolean): void {
    for (const p of this.stage.plinths) p.visible = v;
    for (const l of this.stage.plinthLights) l.visible = v;
  }

  openUniverse(id: string): void {
    if (store.get().transitioning) return;
    const universe = universeById(id);
    this.ambience.start();
    store.set({ universeId: id });

    if (universe.kind === 'companion') {
      const first = residentById(store.get().residentId);
      this.backdrop.showStudio(first.visual.domeTop, first.visual.domeBottom, 0.8);
      this.setPlinthsVisible(false);
      this.portalTarget = 0.35;
      store.goto('stage');
      this.openStage();
    } else {
      this.setPlinthsVisible(true);
      this.buildCharacters();
      store.goto('arrival');
      this.rig.applyPreset(CAMERA_PRESETS.arrival);
    }
  }

  private openStage(): void {
    const s = store.get();
    if (!this.residentStage) {
      this.residentStage = new WaifuStage(this.engine.scene, this.centerTopY);
      void this.residentStage.load(s.residentId, (id) => {
        if (id === store.get().residentId) {
          this.residentStage!.setHero(id);
          this.applyStageAccent();
          this.greet();
        }
        this.picker.setPickSet(this.residentStage!.pickTargets());
      });
    } else {
      this.residentStage.setHero(s.residentId);
      this.applyStageAccent();
    }
    void this.rig.flyTo(CAMERA_PRESETS.stage, this.engine.reducedMotion ? 0 : 1.4).then((done) => {
      if (done && store.get().step === 'stage') this.enableStageOrbit();
    });
  }

  /** Let the visitor lean around her; the turntable itself is an unlock. */
  private enableStageOrbit(): void {
    const c = this.controls;
    c.target.set(0, this.centerTopY + 0.75, 0);
    c.enabled = true;
    c.enableZoom = true;
    c.enablePan = false;
    c.minDistance = 2.6;
    c.maxDistance = 6.2;
    c.minPolarAngle = 0.95;
    c.maxPolarAngle = 1.62;
    // Never hard-clamp the azimuth: a clamp stops the camera dead, which both
    // feels broken and stops firing the events we would need to react to.
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    this.rig.syncLook();
  }

  /** Signed angle away from the front framing, wrapped to [-PI, PI]. */
  private azimuthOffset(): number {
    let d = this.controls.getAzimuthalAngle() - STAGE_AZIMUTH;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /**
   * The front 120 degrees are free. Turn past that and we offer the
   * turntable rather than silently blocking the drag.
   */
  private watchOrbitLimit(): void {
    this.controls.addEventListener('change', () => {
      const st = store.get();
      if (st.step !== 'stage' || !this.controls.enabled) return;
      if (store.viewIsUnlocked || st.unlockGateOpen) return;
      if (Math.abs(this.azimuthOffset()) <= FREE_ARC) return;
      store.set({ unlockGateOpen: true });
      this.snapIntoFreeArc();
    });
  }

  /** Return to the edge of the free arc once the offer is on screen. */
  private snapIntoFreeArc(): void {
    const edge = STAGE_AZIMUTH + Math.sign(this.azimuthOffset()) * FREE_ARC;
    const r = this.controls.getDistance();
    const polar = this.controls.getPolarAngle();
    const t = this.controls.target;
    this.controls.object.position.set(
      t.x + r * Math.sin(polar) * Math.sin(edge),
      t.y + r * Math.cos(polar),
      t.z + r * Math.sin(polar) * Math.cos(edge)
    );
    this.controls.update();
  }

  /**
   * Her canon is the stage direction: the dome she stands in, the two rim
   * colours behind her and the motes in the air all come from her story.
   */
  private applyStageAccent(): void {
    const r = residentById(store.get().residentId);
    const v = r.visual;
    this.residentStage?.setAccent(r.accentColor);
    this.residentStage?.setMotes(v.moteColor, v.moteMotif);
    this.backdrop.showStudio(v.domeTop, v.domeBottom, 0.8);
    const camPos = new THREE.Vector3(...CAMERA_PRESETS.stage.pos);
    const heroPos = new THREE.Vector3(0, 0, 0);
    this.placeRims(heroPos, camPos, v.rimKey);
    this.rimB.color.setHex(v.rimFill);
    // Her display name is her given name, not the full series title.
    this.nameplate.transitionTo(r.name.split(' ')[0], r.accentColor, heroPos, camPos);
  }

  /**
   * Her opening line. On a return visit she opens on an unfinished thread
   * instead of the default greeting — that callback is the whole point of
   * having saved the previous chapter.
   */
  private greet(): void {
    const s = store.get();
    const r = residentById(s.residentId);
    const saved = store.progressFor(s.residentId);
    const line = openingLine(r, saved.memories, saved.nickname);
    store.set({ chat: [{ from: 'resident', text: line }] });
    const voice = r.voices.find((v) => v.slot === s.session.voice) ?? r.voices[0];
    // Only the authored signature greeting has audio; a callback is text.
    this.speak(line, saved.memories.length ? undefined : voice.url);
  }

  /**
   * Drive the speaking pulse, and render her voice if the service is up.
   * Text is already on screen by now: the pulse runs on an estimate, then
   * re-syncs to the real clip when it arrives.
   */
  private speak(text: string, voiceUrl?: string): void {
    window.clearTimeout(this.speakTimer);
    cancelSpeech();
    store.set({ speaking: true });
    this.residentStage?.setSpeaking(true);

    const stopAfter = (secs: number) => {
      window.clearTimeout(this.speakTimer);
      this.speakTimer = window.setTimeout(() => {
        store.set({ speaking: false });
        this.residentStage?.setSpeaking(false);
      }, secs * 1000);
    };

    if (voiceUrl) {
      this.ambience.playClip(voiceUrl);
      stopAfter(speakingDuration(text));
      return;
    }

    stopAfter(speakingDuration(text));
    store.set({ voicing: true });
    const speakerId = store.get().residentId;
    const r = residentById(speakerId);
    const slot = r.voices.find((v) => v.slot === store.get().session.voice) ?? r.voices[0];
    void renderSpeech(text, slot.voiceId).then((url) => {
      store.set({ voicing: false });
      // She may have been swapped out while the audio rendered.
      if (!url || store.get().residentId !== speakerId) return;
      this.ambience.playClip(url);
      store.set({ speaking: true });
      this.residentStage?.setSpeaking(true);
      stopAfter(speakingDuration(text) + 1);
    });
  }

  leaveUniverse(): void {
    this.rig.cancel();
    window.clearTimeout(this.speakTimer);
    window.clearTimeout(this.genTimer);
    this.controls.enabled = false;
    this.ambience.stopClip();
    cancelSpeech();
    this.residentStage?.dispose();
    this.residentStage = null;
    this.mate?.dispose();
    this.mate = null;
    this.revealFx?.dispose();
    this.revealFx = null;
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.loadQueue = [];
    this.selectedId = null;
    this.hoveredId = null;
    this.picker.setPickSet([]);
    this.nameplate.hide();
    this.backdrop.hide();
    this.rimTarget = 0;
    this.portalTarget = 0.12;
    this.setPlinthsVisible(false);
    store.leaveUniverse();
    this.rig.applyPreset(CAMERA_PRESETS.gallery);
  }

  // ---------- Companion actions ----------

  selectResident(id: string): void {
    if (store.get().step !== 'stage' || store.get().residentId === id) return;
    this.controls.enabled = false;
    store.beginEncounter(id as ResidentId);
    this.residentStage?.restoreHero();
    this.residentStage?.setHero(id);
    this.applyStageAccent();
    this.greet();
    this.picker.setPickSet(this.residentStage?.pickTargets() ?? []);
  }

  startChat(): void {
    store.set({ chatOpen: true });
    this.controls.enabled = false;
    void this.rig.flyTo(CAMERA_PRESETS.stageChat, this.engine.reducedMotion ? 0 : 1.0).then((done) => {
      if (done && store.get().step === 'stage') this.enableStageOrbit();
    });
  }

  sendMessage(text: string): void {
    const s = store.get();
    if (s.turns >= FREE_TURNS || s.thinking) return;
    const r = residentById(s.residentId);
    store.pushTurn({ from: 'user', text });
    store.set({ thinking: true });

    const after = store.get();
    const ctx = {
      resident: r,
      session: after.session,
      revealed: after.revealed,
      memories: store.progressFor(s.residentId).memories,
      turn: after.turns,
    };
    // History excludes the turn we just pushed; the message is sent separately.
    const history = after.chat.slice(0, -1);

    void getReply(text, ctx, history).then((result) => {
      if (store.get().residentId !== s.residentId) return; // switched residents
      store.set({ thinking: false });
      store.pushTurn({ from: 'resident', text: result.text });
      if (result.revealedRung !== undefined) {
        store.set({ revealed: result.revealedRung + 1 });
      }
      this.speak(result.text);
      // The free encounter ends by offering to keep what was said, not by
      // blocking the conversation mid-sentence.
      if (store.get().turns >= FREE_TURNS) {
        window.setTimeout(() => store.set({ saveGateOpen: true }), 1200);
      }
    });
  }

  openSessionPanel(): void {
    store.set({ sessionPanelOpen: true });
  }

  closeSessionPanel(): void {
    store.set({ sessionPanelOpen: false });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    store.updateSession(patch);
    if (patch.voice) {
      const r = residentById(store.get().residentId);
      const v = r.voices.find((x) => x.slot === patch.voice);
      if (v?.url) this.ambience.playClip(v.url);
    }
  }

  resetSession(): void {
    store.resetSession();
  }

  saveChapter(memories: string[]): void {
    if (!store.saveChapter(memories)) {
      this.flashError(COPY.stage.noCredits);
      return;
    }
    this.ambience.chime(880);
  }

  continueWithoutSaving(): void {
    store.set({ saveGateOpen: false });
  }

  closeUnlockGate(): void {
    store.set({ unlockGateOpen: false });
  }

  unlockView(code?: string): void {
    const result = store.unlockView(code);
    if (result === 'bad-code') return this.flashError(COPY.stage.badCode);
    if (result === 'no-credits') return this.flashError(COPY.stage.noCredits);
    this.ambience.chime(940);
  }

  regenerateLook(prompt: string): void {
    if (!prompt.trim()) {
      this.flashError(COPY.errors.emptyInput);
      return;
    }
    const seed = fnv1a(prompt.trim().toLowerCase());
    this.residentStage?.tintHero(seed);
    store.set({ variantSeed: seed, variantLabel: `Look ${(seed % 900) + 100}` });
    this.ambience.chime(720 + (seed % 5) * 40);
  }

  restoreLook(): void {
    this.residentStage?.restoreHero();
    store.set({ variantSeed: null, variantLabel: null });
  }
  // ---------- Creator actions ----------

  enterUniverse(): void {
    if (store.get().transitioning) return;
    this.ambience.start();
    this.portalTarget = 1;
    store.set({ transitioning: true });
    void this.rig.flyTo(CAMERA_PRESETS.hall, 2.2).then((completed) => {
      if (!completed) return;
      // The beam settles to a faint idle glow through the studio.
      this.portalTarget = 0.28;
      store.set({ transitioning: false });
      store.goto('studio');
      this.flyToCharacter(store.get().characterId, 1.4);
      this.playVoice(store.get().characterId);
    });
  }

  skipTransition(): void {
    this.rig.skip();
  }

  selectCharacter(id: string): void {
    if (store.get().step !== 'studio') return;
    if (store.get().characterId === id) return;
    store.selectCharacter(id);
    this.playVoice(id);
    this.flyToCharacter(id);
  }

  stepCharacter(delta: number): void {
    const idx = characterIndex(store.get().characterId);
    const next = (idx + delta + CHARACTERS.length) % CHARACTERS.length;
    this.selectCharacter(CHARACTERS[next].id);
  }

  setGenText(text: string): void {
    store.setGen({ mode: 'text', text });
  }

  setGenPhoto(file: File): void {
    if (!file.type.startsWith('image/') || file.size === 0) {
      this.flashError(COPY.errors.badImage);
      return;
    }
    store.clearPhoto();
    const url = URL.createObjectURL(file);
    store.setGen({ mode: 'photo', photoUrl: url, photoName: file.name });
    void file
      .slice(0, 65536)
      .arrayBuffer()
      .then((buf) => {
        this.photoSeed = fnv1a(new Uint8Array(buf));
      });
  }

  clearGenPhoto(): void {
    store.clearPhoto();
  }

  generate(): void {
    const s = store.get();
    if (s.genPhase === 'processing' || s.transitioning) return;
    const usePhoto = s.gen.mode === 'photo' && !!s.gen.photoUrl;
    const text = s.gen.text.trim();
    if (!usePhoto && !text) {
      this.flashError(COPY.errors.emptyInput);
      return;
    }
    store.set({ genPhase: 'processing' });
    const seed = usePhoto ? this.photoSeed : fnv1a(text.toLowerCase());
    const character = characterById(s.characterId);
    const faction = factionById(character.factionId);
    const delay = this.engine.reducedMotion ? 400 : 2400;

    window.clearTimeout(this.genTimer);
    this.genTimer = window.setTimeout(() => {
      void loadNormalized(character.modelUrl)
        .then((model) => {
          const { label } = applyVariantTint(model, faction, seed);
          // The center base is the stand; no extra collectible pedestal.
          const mate = new GlbChampion(faction, model, { pedestal: false });
          return { mate: mate as ChampionView, label };
        })
        .then(({ mate, label }) => {
          this.mate?.dispose();
          this.mate = mate;
          mate.root.position.set(0, this.centerTopY, 0);
          this.portalTarget = 1;
          this.engine.scene.add(mate.root);
          store.set({ genPhase: 'done', variantSeed: seed, variantLabel: label, transitioning: true });
          this.nameplate.hide();
          this.ambience.chime(880);
          // Reveal staging: figure spins in facing the reveal camera, rim rig
          // swings to the center pedestal in the faction accent.
          const revealCam = new THREE.Vector3(...CAMERA_PRESETS.reveal.pos);
          const mateYaw = Math.atan2(revealCam.x, revealCam.z);
          if (mate instanceof GlbChampion && !this.engine.reducedMotion) mate.spinTo(mateYaw);
          else mate.setFacing(mateYaw, this.engine.reducedMotion);
          this.placeRims(new THREE.Vector3(0, 0.09, 0), revealCam, faction.accentColor);
          this.revealFx?.dispose();
          this.revealFx = createRevealFx(this.engine.scene, faction.accentColor);
          const flight = this.rig.flyTo(CAMERA_PRESETS.reveal, 1.8);
          const fx = this.revealFx.play(this.engine.reducedMotion);
          void Promise.all([flight, fx]).then(([completed]) => {
            this.revealFx?.dispose();
            this.revealFx = null;
            if (!completed) return;
            // Beam dies down so it never veils the revealed Mate.
            this.portalTarget = 0.04;
            store.set({ transitioning: false });
            store.goto('reveal');
            this.controls.enabled = true;
            this.rig.syncLook();
          });
        })
        .catch(() => {
          // Base model unavailable: fail honestly instead of a stand-in Mate.
          store.set({ genPhase: 'idle' });
          this.flashError(COPY.errors.generic);
        });
    }, delay);
  }

  backTo(step: Step): void {
    store.goto(step);
  }

  backToStudio(): void {
    this.rig.cancel();
    this.controls.enabled = false;
    store.set({ transitioning: false, genPhase: 'idle' });
    store.goto('studio');
    this.flyToCharacter(store.get().characterId, 1.0);
  }

  setMateName(name: string): void {
    store.set({ mateName: name });
  }

  join(): void {
    if (store.get().transitioning) return;
    this.ambience.chime(990);
    this.controls.enabled = false;
    this.nameplate.hide();
    store.set({ transitioning: true });
    void this.rig.flyTo(CAMERA_PRESETS.lineup, 2.2).then((completed) => {
      if (!completed) return;
      store.set({ transitioning: false });
      store.goto('joined');
    });
  }

  restart(): void {
    this.rig.cancel();
    window.clearTimeout(this.genTimer);
    this.controls.enabled = false;
    this.mate?.dispose();
    this.mate = null;
    this.revealFx?.dispose();
    this.revealFx = null;
    this.nameplate.hide();
    this.backdrop.hide();
    this.rimTarget = 0;
    this.selectedId = null;
    this.ambience.stopClip();
    this.portalTarget = 0.12;
    store.restart();
    this.rig.applyPreset(CAMERA_PRESETS.arrival);
  }

  toggleMute(): boolean {
    this.ambience.setMuted(!this.ambience.muted);
    return this.ambience.muted;
  }
}

new App();
