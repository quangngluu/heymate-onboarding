import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from './three/engine';
import { CameraRig } from './three/rig';
import { PointerSway } from './three/pointer-sway';
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
import type { RevealFx } from './three/reveal';
import { createScanRevealFx, type ScanRevealFx } from './three/scan-reveal';
import { Nameplate } from './three/nameplate';
import { FactionBackdrop } from './three/backdrop';
import { WaifuStage } from './three/waifu-stage';
import { TurntableController } from './three/turntable';
import { idleLine, openingLine, speakingDuration } from './chat/engine';
import { getReply } from './chat/client';
import {
  ConversationLifetime,
  effectivePromptSession,
  type ConversationMode,
  type ConversationToken,
} from './chat/mode';
import { cancelSpeech, renderSpeech, resetSpeechEmotion, streamSpeech } from './chat/voice';
import { spoken } from './chat/dialogue';
import {
  openingVisualFor,
} from './chat/open-chat-visuals';
import { OpenChatVisualRuntime } from './chat/open-chat-visual-runtime';
import type { ResidentId } from './config/residents';
import { residentById } from './config/residents';
import { canonViewFor } from './config/canon-view';
import { resolveCanonRoute } from './config/canon-route';
import {
  questNode,
  type QuestDefinition,
  type QuestPresentation,
} from './config/quests';
import { QuestVisualRuntime } from './quest/visual-runtime';
import { Ambience } from './audio/ambience';
import { COST, store, type AppState, type ChatTurn, type FigurineOrder, type SessionSetup, type ShippingInfo, type Step } from './state/store';
import { mountUI } from './ui/overlay';
import type { UIActions } from './ui/actions';
import {
  CAMERA_PRESETS,
  QUEST_CAMERA_PRESETS,
  premiumInspectPreset,
  stagePreset,
} from './config/cameras';
import { COPY } from './config/copy';
import { factionById } from './config/factions';
import { CHARACTERS, characterById, characterIndex } from './config/characters';
import { universeById } from './config/universes';
import { fnv1a } from './util/hash';
import {
  kaguraFigurineVariantById,
  type KaguraFigurineVariantId,
} from './config/figurine-products';
import { EDITION_REVEAL_MS, PAYMENT_SIM_MS, type PaymentMethod } from './config/demo-journey';
import { shouldPlayTeaser } from './config/entry';

const PLINTHS = plinthPositions(CHARACTERS.length);

/** Soft transparent catcher that grounds the live base on the video desk. */
function createDeskContactShadow(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(96, 96, 16, 96, 96, 90);
  gradient.addColorStop(0, 'rgba(0,0,0,0.58)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 192);
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.55), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.renderOrder = -1;
  shadow.visible = false;
  return shadow;
}

/** Keep the reply hidden briefly for a synchronized voice start, never indefinitely. */
// Her line is uncovered a word at a time. It is not decoration: rendering the
// whole paragraph at once and then sitting silent for four seconds reads as a
// stall, while a line that is still arriving reads as someone speaking. When
// the clip lands, the remaining words are re-paced to finish with it.
// Paced off the estimated speaking time so the words come out at roughly the
// rate she would say them, which is also long enough to cover the render.
const MIN_WORD_MS = 26;
const MAX_WORD_MS = 220;

/**
 * How many lines she will say into a silence before she stops.
 *
 * A companion who never speaks first is a form; one who keeps going after five
 * unanswered lines is talking at someone who has left.
 */
const MAX_UNANSWERED = 5;

function storyContext(
  residentId: ResidentId,
  mode: 'open-chat' | 'quest'
): { flags: string[]; outcomes: string[] } {
  const state = store.get();
  if (mode === 'open-chat') {
    const approved = store.approvedForChat(residentId);
    return {
      flags: approved.map((memory) => `${memory.kind}:${memory.id}`),
      outcomes: approved.map((memory) => memory.text),
    };
  }
  const questTitles = new Map(store.questsFor(residentId).map((quest) => [quest.id, quest.title]));
  return {
    flags: state.storyFlags[residentId] ?? [],
    outcomes: Object.entries(state.questHistory)
      .filter(([questId]) => questTitles.has(questId))
      .flatMap(([questId, outcomes]) =>
        outcomes.map((outcome) => `${questTitles.get(questId)}: ${outcome}`)
      ),
  };
}

/** Matched live-desk framing: independent plate/figure transforms, lights and letterbox. */
type LiveDolly = {
  deskX: number;
  deskY: number;
  deskS: number;
  stageX: number;
  stageY: number;
  stageSX: number;
  stageSY: number;
  lights: number;
  mask: number;
};

class App implements UIActions {
  private engine: Engine;
  private rig: CameraRig;
  private pointerSway: PointerSway;
  private controls: OrbitControls;
  private turntable: TurntableController;
  private turntableYaw = 0;
  private deskVideo: HTMLVideoElement;
  private deskStageActive = false;
  private deskHeroReady = false;
  private pendingCompanionFinish = false;
  private defaultSceneBackground: THREE.Color | THREE.Texture | null = null;
  private defaultSceneFog: THREE.Fog | THREE.FogExp2 | null = null;
  private deskContactShadow: THREE.Mesh;
  private stage: StageHandles;
  private picker: Picker;
  private ambience = new Ambience();
  private questVisuals: QuestVisualRuntime;
  private openChatVisuals: OpenChatVisualRuntime;
  private conversation = new ConversationLifetime();
  private nameplate: Nameplate;
  private backdrop!: FactionBackdrop;
  /** True while an Open Chat scene owns the backdrop (figure dimmed behind it). */
  private openChatSceneActive = false;
  /** Invalidates late texture loads when a newer scene or turn takes ownership. */
  private openChatSceneToken = 0;

  private views = new Map<string, ChampionView>();
  private liftTargets = new Map<string, number>();
  private hoveredId: string | null = null;
  private mate: ChampionView | null = null;
  private revealFx: RevealFx | null = null;
  private premiumScanFx: ScanRevealFx | null = null;

  private rimA!: THREE.SpotLight;
  private rimB!: THREE.SpotLight;
  private rimTarget = 0;
  private selectedId: string | null = null;

  private residentStage: WaifuStage | null = null;
  private speakTimer = 0;
  private idleTimer = 0;
  private editionsTimer = 0;
  private revealTimer = 0;
  private paymentSimTimer = 0;
  private cryoFlash: THREE.PointLight | null = null;
  private premiumRevealToken = 0;
  private premiumPending: {
    id: KaguraFigurineVariantId;
    token: number;
    modelReady: boolean;
    videoReady: boolean;
  } | null = null;
  /** Bumped whenever a newer line takes over, so a late clip stays quiet. */
  private speechToken = 0;
  /** She breaks a silence at most twice per encounter. */
  private idleSpoken = 0;
  private questTimers: number[] = [];
  private questSequenceToken = 0;
  private thresholdInterruptible = false;

  private photoSeed = 0;
  private genTimer = 0;
  private portalActivation = 0;
  private portalTarget = 0.12;
  /** Height of the loaded center base's top surface (Mate stands here). */
  private centerTopY = 0.09;
  private centerBase: THREE.Group | null = null;
  private centerBaseLoading = false;
  private centerBaseSettled = false;
  private errorTimer = 0;
  /** rAF handle for the live desk dolly-out; 0 when idle. */
  private liveDollyRaf = 0;
  /** Guards the one-shot video→stage reveal so it completes exactly once. */
  private companionRevealState: 'idle' | 'running' | 'done' = 'idle';

  private conversationToken(): ConversationToken {
    return this.conversation.capture(store.get());
  }

  private conversationIsCurrent(token: ConversationToken): boolean {
    return this.conversation.isCurrent(token, store.get());
  }

  /** Stop every presentational side effect owned by the conversation we leave. */
  private transitionConversation(): void {
    this.conversation.transition();
    this.openChatVisuals.cancel();
    this.restoreOpenChatScene();
    this.cancelIdleNudge();
    this.speechToken++;
    window.clearTimeout(this.speakTimer);
    window.clearInterval(this.revealTimer);
    cancelSpeech();
    this.ambience.stopClip();
    store.set({ thinking: false, voicing: false, speaking: false, reveal: null });
    this.residentStage?.setSpeaking(false);
  }

  constructor() {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    this.deskVideo = document.getElementById('desk-loop') as HTMLVideoElement;
    this.deskVideo.muted = true;
    this.deskVideo.loop = true;
    this.deskVideo.playsInline = true;
    this.engine = new Engine(canvas);
    initCharacterLoader(this.engine.renderer);
    this.rig = new CameraRig(this.engine.camera, this.engine.reducedMotion);
    this.pointerSway = new PointerSway((x, y) => this.rig.setSway(x, y), {
      reducedMotion: this.engine.reducedMotion,
      active: () => !this.deskStageActive,
    });

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
    this.defaultSceneBackground = this.engine.scene.background;
    this.defaultSceneFog = this.engine.scene.fog;
    this.deskContactShadow = createDeskContactShadow();
    this.engine.scene.add(this.deskContactShadow);
    this.nameplate = new Nameplate(this.engine.scene, this.engine.camera);
    this.backdrop = new FactionBackdrop(
      this.engine.scene,
      [this.stage.skyline],
      undefined,
      this.engine.reducedMotion,
      this.engine.camera
    );
    this.questVisuals = new QuestVisualRuntime(store, undefined, (url) => {
      return this.backdrop.showScene(url);
    });
    this.openChatVisuals = new OpenChatVisualRuntime(
      store,
      undefined,
      (url) => this.presentOpenChatScene(url)
    );

    // Selection rim rig: two colored back-side lights that follow whatever is
    // in focus (selected plinth, then the Mate) so figures pop off the pano.
    this.rimA = new THREE.SpotLight(0xffffff, 0, 16, Math.PI / 4, 0.9, 1.6);
    this.rimB = new THREE.SpotLight(0x6fa8ff, 0, 16, Math.PI / 4, 0.9, 1.6);
    for (const rim of [this.rimA, this.rimB]) {
      this.engine.scene.add(rim);
      this.engine.scene.add(rim.target);
    }

    this.turntable = new TurntableController(canvas, {
      enabled: () => this.turntableEnabled(),
      yaw: () => this.turntableYaw,
      onYaw: (yaw) => this.setTurntableYaw(yaw, true),
      onDragChange: (dragging) => {
        if (dragging) document.documentElement.dataset.deskTurning = 'true';
        else delete document.documentElement.dataset.deskTurning;
      },
    });
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
    window.addEventListener('resize', () => {
      this.rig.refreshFov();
      if (!this.deskStageActive || this.companionRevealState === 'running') return;
      this.applyDolly(
        this.companionRevealState === 'done'
          ? this.liveDollyRestVals()
          : this.liveDollyStartVals()
      );
    });
    this.engine.onUpdate((dt, t) => this.tick(dt, t));
    this.engine.start();

    // Gallery stays model-free. Even the center base waits until the visitor
    // has crossed the cinematic gate into an actual universe.
    let booted = false;
    const off = this.engine.onUpdate(() => {
      if (booted) return;
      booted = true;
      window.setTimeout(() => {
        this.setPlinthsVisible(false);
        document.getElementById('boot')?.classList.add('is-done');
        off();
      }, 0);
    });

    store.subscribe((s, prev) => {
      if (s.characterId !== prev.characterId || s.step !== prev.step) this.updateLiftTargets();
      this.applyHeroStaging(s);
      this.setEntryStageActive(s.step === 'gallery');
      this.picker.enabled =
        !s.transitioning &&
        (s.step === 'studio' ||
          (s.step === 'stage' &&
            (s.companionMode === 'showcase' || s.companionMode === 'playground') &&
            !s.activeQuestId));
      if (s.paymentSim === 'processing' && prev.paymentSim !== 'processing') {
        window.clearTimeout(this.paymentSimTimer);
        const delay = this.engine.reducedMotion ? 0 : PAYMENT_SIM_MS;
        this.paymentSimTimer = window.setTimeout(() => store.completePaymentSim(), delay);
      } else if (s.paymentSim !== 'processing' && prev.paymentSim === 'processing') {
        window.clearTimeout(this.paymentSimTimer);
      }
    });
    this.setEntryStageActive(store.get().step === 'gallery');

    mountUI(document.getElementById('ui')!, store, this);
    window.addEventListener('error', () => this.flashError(COPY.errors.generic));

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__hm = {
        store,
        rig: this.rig,
        camera: this.engine.camera,
        engine: this.engine,
        // Alignment helpers (dev only): stage the live desk and try dolly values.
        prepDesk: () => this.prepareCompanionStageForHandoff(),
        setDolly: (x: number, y: number, s: number, lights = 1, mask = 0) =>
          this.applyDolly({
            deskX: x,
            deskY: y,
            deskS: s,
            stageX: x,
            stageY: y,
            stageSX: s,
            stageSY: s,
            lights,
            mask,
          }),
        setMatchDolly: (
          deskX: number,
          deskY: number,
          deskS: number,
          stageX: number,
          stageY: number,
          stageSX: number,
          stageSY: number,
          lights = 1,
          mask = 0
        ) =>
          this.applyDolly({
            deskX,
            deskY,
            deskS,
            stageX,
            stageY,
            stageSX,
            stageSY,
            lights,
            mask,
          }),
        dollyStart: () => this.liveDollyStartVals(),
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
    if (this.centerBase || this.centerBaseLoading) return;
    this.centerBaseLoading = true;
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
        this.centerBase = base;
        base.rotation.y = this.turntableYaw;
        base.visible = store.get().figurineDisplayMode !== 'premium';
        this.centerTopY = box2.max.y - box2.min.y;
        this.stage.centerPedestal.visible = false;
        this.mate?.root.position.setY(this.centerTopY);
        this.residentStage?.setBaseTop(this.centerTopY);
        this.centerBaseSettled = true;
        this.updateCompanionHandoffReady();
      })
      .catch(() => {
        this.centerBaseSettled = true;
        this.updateCompanionHandoffReady();
        console.warn('Portal base GLB missing; placeholder pedestal stays.');
      })
      .finally(() => {
        this.centerBaseLoading = false;
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
    this.pointerSway.update(dt);
    if (this.controls.enabled && !this.rig.flying) this.controls.update();
    this.stage.update(dt, t);
    this.picker.update();
    this.revealFx?.update(dt);
    this.premiumScanFx?.update(dt);
    this.nameplate.update(dt);
    this.backdrop.update(dt);
    if (this.cryoFlash) {
      this.cryoFlash.intensity *= Math.max(0, 1 - dt * 8.5);
      if (this.cryoFlash.intensity < 0.03) {
        this.engine.scene.remove(this.cryoFlash);
        this.cryoFlash.dispose();
        this.cryoFlash = null;
      }
    }

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
    store.set({ universeId: id, transitioning: true });

    if (universe.kind === 'companion') {
      // Opening the universe is an encounter like any other, so it goes through
      // the same door as a resident switch. Without this the first entry after a
      // reload left `chat` empty and she opened on the greeting while the
      // transcript sat in storage — the saved thread has to be picked up here,
      // not only when the visitor changes who is on the plinth.
      resetSpeechEmotion();
      // Kagura owns the cinematic hook. Opening on another resident after the
      // teaser made the hand-off feel like two unrelated experiences.
      store.beginEncounter('kagura');
      // The live desk and GLB render behind the cinematic gate. The last video
      // dissolves into that actual scene, so the final displayed frame and the
      // first interactive frame share one camera, loop and figure transform.
      store.set({
        companionMode: 'teaser',
        figurineDisplayMode: 'original',
        transitioning: false,
      });
      this.setPlinthsVisible(false);
      store.goto('companion-teaser');
      this.prepareCompanionStageForHandoff();
      if (shouldPlayTeaser(store.get().waifuUniverseEntered)) {
        // Pre-frame the live desk to the teaser's final shot; the dolly-out
        // eases off this once the last clip dissolves.
        this.applyDolly(this.liveDollyStartVals());
        this.prefetchModel(residentById('kagura').modelUrl);
      } else {
        this.finishCompanionTeaser();
      }
    } else {
      store.set({ transitioning: false });
      if (!this.centerBase) this.loadCenterBase();
      this.setPlinthsVisible(true);
      this.buildCharacters();
      store.goto('arrival');
      this.rig.applyPreset(CAMERA_PRESETS.arrival);
    }
  }

  private openStage(flyCamera = true, onHeroReady?: () => void): void {
    const s = store.get();
    if (!this.residentStage) {
      this.residentStage = new WaifuStage(
        this.engine.scene,
        this.centerTopY,
        this.engine.renderer.capabilities.getMaxAnisotropy(),
        this.engine.small
      );
      void this.residentStage.load(s.residentId, (id) => {
        if (id === store.get().residentId) {
          this.residentStage!.setHero(id);
          this.applyStageAccent();
          onHeroReady?.();
        }
        this.picker.setPickSet(this.residentStage!.pickTargets());
      });
    } else {
      void this.residentStage.load(s.residentId, (id) => {
        if (id !== store.get().residentId) return;
        this.residentStage!.setHero(id);
        this.applyStageAccent();
        onHeroReady?.();
      });
    }
    if (flyCamera) {
      void this.rig.flyTo(stagePreset(), this.engine.reducedMotion ? 0 : 1.4).then((done) => {
        if (done && store.get().step === 'stage') this.enableStageOrbit();
      });
    }
  }

  /** Companion inspection rotates the collectible, never the desk camera. */
  private enableStageOrbit(): void {
    this.controls.enabled = false;
    this.rig.syncLook();
    this.setTurntableYaw(this.turntableYaw, true);
  }

  private turntableEnabled(): boolean {
    const s = store.get();
    return (
      this.deskStageActive &&
      !s.transitioning &&
      !s.activeQuestId &&
      // The catalog grid is a modal over the stage; stray drags there must not
      // spin the figure behind it. (Detail view is intentionally pass-through so
      // the live 3D can still be rotated, so only the grid face is blocked.)
      !(s.collectibleOpen && s.collectibleView === 'grid') &&
      (s.companionMode === 'showcase' || s.companionMode === 'playground') &&
      s.figurineDisplayMode !== 'premium-preview'
    );
  }

  private setTurntableYaw(yaw: number, immediate = false): void {
    this.turntableYaw = yaw;
    if (this.centerBase) this.centerBase.rotation.y = yaw;
    this.residentStage?.setHeroYaw(yaw, immediate);
  }

  private shouldUseDeskStage(s: AppState): boolean {
    return (
      s.universeId === 'waifu-universe' &&
      !s.activeQuestId &&
      (s.step === 'companion-teaser' || s.step === 'stage')
    );
  }

  private setDeskStageActive(active: boolean): void {
    if (this.deskStageActive === active) return;
    this.deskStageActive = active;
    document.documentElement.dataset.deskStage = String(active);
    this.stage.group.visible = !active;
    this.deskContactShadow.visible = active;
    this.residentStage?.setAmbientEffectsVisible(!active);
    if (active) {
      this.engine.scene.background = null;
      this.engine.scene.fog = null;
      this.backdrop.hide();
      this.nameplate.hide();
      if (this.engine.reducedMotion) {
        this.deskVideo.pause();
        this.deskVideo.currentTime = 0;
      } else {
        void this.deskVideo.play().catch(() => {
          // The poster remains visible if a browser rejects muted autoplay.
        });
      }
      return;
    }
    delete document.documentElement.dataset.deskHeroReady;
    this.deskVideo.pause();
    this.clearLiveDolly();
    this.companionRevealState = 'idle';
    this.engine.scene.background = this.defaultSceneBackground;
    this.engine.scene.fog = this.defaultSceneFog;
  }

  /** Build the exact live frame under the final clip while the teaser plays. */
  private prepareCompanionStageForHandoff(): void {
    this.setTurntableYaw(0, true);
    if (!this.centerBase) this.loadCenterBase();
    this.rig.applyPreset(stagePreset());
    this.deskHeroReady = false;
    this.pendingCompanionFinish = false;
    this.companionRevealState = 'idle';
    document.documentElement.dataset.deskHeroReady = 'false';
    this.setDeskStageActive(true);
    // Keep only the official teaser decoding during the cinematic. The desk
    // loop is already framed on its poster and starts at the dissolve, avoiding
    // two simultaneous videos competing with WebGL on lower-power devices.
    this.deskVideo.pause();
    if (this.deskVideo.currentTime !== 0) this.deskVideo.currentTime = 0;
    this.openStage(false, () => {
      this.deskHeroReady = true;
      this.residentStage?.setAmbientEffectsVisible(false);
      this.updateCompanionHandoffReady();
    });
  }

  /** The dissolve is safe only after both meshes own their final transforms. */
  private updateCompanionHandoffReady(): void {
    const ready = this.deskHeroReady && this.centerBaseSettled;
    document.documentElement.dataset.deskHeroReady = String(ready);
    if (ready && this.pendingCompanionFinish) this.completeCompanionHandoff();
  }

  /**
   * Screen-space envelope that matches the final teaser frame. The baked desk
   * plate and the transparent figurine cannot share one transform: the teaser
   * ends with the book closer to camera than the collectible. They stay on
   * these matched depth planes after the dissolve; only light and letterbox
   * change. Mobile plays the portrait clip full-bleed, so it has no letterbox.
   */
  private liveDollyStartVals(): LiveDolly {
    const portrait =
      typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
    return portrait
      ? {
          deskX: 0,
          deskY: -13,
          deskS: 1.2,
          stageX: 0,
          stageY: 5.7,
          stageSX: 1.085,
          stageSY: 1.085,
          lights: 0.85,
          mask: 0,
        }
      : {
          deskX: 2.2,
          deskY: -8.4,
          deskS: 1,
          stageX: -0.2,
          stageY: 6.13,
          stageSX: 1.13,
          stageSY: 1.135,
          lights: 0.85,
          mask: 1,
        };
  }

  /** Interactive framing keeps the exact match; only lights and mask finish. */
  private liveDollyRestVals(): LiveDolly {
    return { ...this.liveDollyStartVals(), lights: 1, mask: 0 };
  }

  /** Write the matched plate/figure transforms and shared lights/mask variables. */
  private applyDolly(v: LiveDolly): void {
    const st = document.documentElement.style;
    st.setProperty('--live-desk-x', `${v.deskX}vh`);
    st.setProperty('--live-desk-y', `${v.deskY}vh`);
    st.setProperty('--live-desk-s', `${v.deskS}`);
    st.setProperty('--live-stage-x', `${v.stageX}vh`);
    st.setProperty('--live-stage-y', `${v.stageY}vh`);
    st.setProperty('--live-stage-sx', `${v.stageSX}`);
    st.setProperty('--live-stage-sy', `${v.stageSY}`);
    st.setProperty('--live-lights', `${v.lights}`);
    st.setProperty('--live-mask', `${v.mask}`);
  }

  /** Drop back to the identity framing so no other desk use inherits the dolly. */
  private clearLiveDolly(): void {
    if (this.liveDollyRaf) {
      cancelAnimationFrame(this.liveDollyRaf);
      this.liveDollyRaf = 0;
    }
    const st = document.documentElement.style;
    st.removeProperty('--live-desk-x');
    st.removeProperty('--live-desk-y');
    st.removeProperty('--live-desk-s');
    st.removeProperty('--live-stage-x');
    st.removeProperty('--live-stage-y');
    st.removeProperty('--live-stage-sx');
    st.removeProperty('--live-stage-sy');
    st.removeProperty('--live-lights');
    st.removeProperty('--live-mask');
  }

  /**
   * The last clip dissolves into the matched live frame. Keep every spatial
   * anchor fixed while the letterbox opens and the office lights come up.
   */
  beginCompanionReveal(): void {
    if (this.companionRevealState !== 'idle') return;
    const s = store.get();
    if (s.step !== 'companion-teaser' || s.companionMode !== 'teaser') return;
    const start = this.liveDollyStartVals();
    const rest = this.liveDollyRestVals();
    if (this.engine.reducedMotion) {
      this.applyDolly(rest);
      this.companionRevealState = 'done';
      this.completeCompanionHandoff();
      return;
    }
    void this.deskVideo.play().catch(() => {
      // The poster is the same authored desk frame if muted autoplay fails.
    });
    this.companionRevealState = 'running';
    const holdMs = 900; // let the matched frame read after the gate clears
    const durationMs = 900;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const t0 = performance.now();
    const step = (now: number) => {
      const raw = (now - t0 - holdMs) / durationMs;
      const k = easeOut(Math.min(1, Math.max(0, raw)));
      this.applyDolly({
        deskX: lerp(start.deskX, rest.deskX, k),
        deskY: lerp(start.deskY, rest.deskY, k),
        deskS: lerp(start.deskS, rest.deskS, k),
        stageX: lerp(start.stageX, rest.stageX, k),
        stageY: lerp(start.stageY, rest.stageY, k),
        stageSX: lerp(start.stageSX, rest.stageSX, k),
        stageSY: lerp(start.stageSY, rest.stageSY, k),
        lights: lerp(start.lights, rest.lights, k),
        mask: lerp(start.mask, rest.mask, k),
      });
      if (raw >= 1) {
        this.liveDollyRaf = 0;
        this.companionRevealState = 'done';
        this.completeCompanionHandoff();
      } else {
        this.liveDollyRaf = requestAnimationFrame(step);
      }
    };
    this.applyDolly(start);
    this.liveDollyRaf = requestAnimationFrame(step);
  }

  /** Gallery is one static full-screen frame; no Three.js room or portal. */
  private setEntryStageActive(active: boolean): void {
    if (active) {
      document.documentElement.dataset.entryStage = 'true';
      this.deskVideo.pause();
      if (this.deskVideo.currentTime !== 0) this.deskVideo.currentTime = 0;
      return;
    }
    delete document.documentElement.dataset.entryStage;
  }

  /**
   * Her canon is the stage direction: the dome she stands in, the two rim
   * colours behind her and the motes in the air all come from her story.
   */
  private applyStageAccent(): void {
    const r = canonViewFor(store.get().residentId, resolveCanonRoute());
    const v = r.visual;
    this.residentStage?.setAccent(r.accentColor);
    this.residentStage?.setMotes(v.moteColor, v.moteMotif);
    this.showHeroVoidDome(v.domeTop, v.domeBottom);
    const premium = store.get().figurineDisplayMode === 'premium';
    const cameraPreset = premium ? premiumInspectPreset() : stagePreset();
    const camPos = new THREE.Vector3(...cameraPreset.pos);
    const heroPos = this.residentStage?.displayFocus() ?? new THREE.Vector3(0, 0, 0);
    this.placeRims(heroPos, camPos, v.rimKey);
    this.rimB.color.setHex(v.rimFill);
    // Her display name is her given name, not the full series title.
    if (this.deskStageActive) this.nameplate.hide();
    else this.nameplate.transitionTo(r.name.split(' ')[0], r.accentColor, heroPos, camPos);
  }

  private setPremiumDisplay(enabled: boolean): void {
    this.engine.setBloomEnabled(enabled);
    if (this.centerBase) this.centerBase.visible = !enabled;
  }

  /**
   * Float the Mate in the void for her hero moment. Hiding the ground disc and
   * the white plinth leaves her suspended in the smoke sky, which the rim-led
   * rig then carves her out of. Scoped to the waifu stage once she is revealed;
   * every other step keeps its floor so the room still reads as a room, and
   * premium/playground keep owning the plinth in their own paths.
   */
  /**
   * The Mate's hero backdrop: her canon dome colours crushed toward a dark
   * atmospheric void so she reads as floating in her own smoke sky, not
   * standing in a lit grey room. Dark enough that the back rims trace her
   * silhouette; the boosted envMapIntensity keeps the black armour reflective.
   */
  private showHeroVoidDome(top: number, bottom: number): void {
    if (this.deskStageActive) {
      this.backdrop.hide();
      return;
    }
    const voidTop = new THREE.Color(top).multiplyScalar(0.26).getHex();
    const voidBottom = new THREE.Color(bottom).multiplyScalar(0.44).getHex();
    this.backdrop.showStudio(voidTop, voidBottom, 1.2);
  }

  private applyHeroStaging(s: AppState): void {
    const deskStage = this.shouldUseDeskStage(s);
    this.setDeskStageActive(deskStage);
    const inWaifuHero =
      s.step === 'stage' &&
      s.universeId === 'waifu-universe' &&
      (s.companionMode === 'reveal' || s.companionMode === 'showcase');
    this.stage.floor.visible = !deskStage && !inWaifuHero;
    if (this.centerBase) {
      if (s.step === 'gallery') {
        this.centerBase.visible = false;
      } else if (deskStage) {
        this.centerBase.visible = s.figurineDisplayMode !== 'premium';
      } else if (inWaifuHero) {
        this.centerBase.visible = false;
      }
    }
  }

  /**
   * Move an Open Chat frame out of the transcript and onto the backdrop, behind
   * the name, dimming the sculpt so the generated image reads as the scene rather
   * than sitting beside a second copy of her.
   */
  private async presentOpenChatScene(src: string): Promise<boolean> {
    const token = ++this.openChatSceneToken;
    this.openChatSceneActive = true;
    document.documentElement.dataset.openChatScene = 'loading';
    const ok = await this.nameplate.showImage(src);
    if (token !== this.openChatSceneToken || !this.openChatSceneActive) return false;
    if (ok) {
      document.documentElement.dataset.openChatScene = 'ready';
      return true;
    }
    this.openChatSceneActive = false;
    delete document.documentElement.dataset.openChatScene;
    return false;
  }

  /** Fade the frame back out from behind the name on the next turn. */
  private restoreOpenChatScene(): void {
    if (!this.openChatSceneActive) return;
    this.openChatSceneToken++;
    this.openChatSceneActive = false;
    delete document.documentElement.dataset.openChatScene;
    this.nameplate.hideImage();
  }

  /**
   * Surface the authored attachment->buy bridge beat once the assistant reply
   * has settled (text revealed, voice finished). It is deterministic: the
   * Store gates eligibility, this only waits for the right quiet moment.
   */
  private maybeSurfaceBridgeBeat(conversation = this.conversationToken()): void {
    if (!this.conversationIsCurrent(conversation)) return;
    if (!store.peekBridgeBeat()) return;
    const s = store.get();
    if (s.thinking || s.voicing || s.speaking || s.reveal) {
      window.setTimeout(() => this.maybeSurfaceBridgeBeat(conversation), 350);
      return;
    }
    store.consumeBridgeBeat();
  }

  /**
   * Her opening line. On a return visit she opens on an unfinished thread
   * instead of the default greeting — that callback is the whole point of
   * having saved the previous chapter.
   */
  private greet(): void {
    const s = store.get();
    const route = resolveCanonRoute();
    const r = canonViewFor(s.residentId, route);
    const saved = store.progressFor(s.residentId);
    this.idleSpoken = 0;

    // A transcript came back with her, so this is not an opening — it is her
    // noticing he is back. `returnGreeting` is authored for exactly this and
    // says so out loud, and the history stays on screen underneath it.
    const resuming = s.chat.length > 0;
    const line = resuming
      ? r.returnGreeting
      : openingLine(r, saved.memories, saved.bond?.address ?? '', saved.revealed, route, s.figurineOwned);
    const visual = openingVisualFor(s.residentId);
    const openingTurn: ChatTurn = {
      from: 'resident',
      text: line,
      visualId: visual.id,
      visualAfterSentence: 2,
    };
    const chat: ChatTurn[] = resuming
      ? [...s.chat, openingTurn]
      : [openingTurn];
    store.set({ chat });
    void this.presentOpenChatScene(visual.src);

    const voice = r.voices.find((v) => v.slot === 'signature') ?? r.voices[0];
    // Only the authored signature greeting has a recording; everything else is
    // rendered, or stays text when there is no endpoint.
    this.speak(line, !resuming && !saved.memories.length ? voice.url : undefined);
    this.streamIn(chat.length - 1, line, Promise.resolve(null), false);
  }

  /**
   * If the visitor goes quiet she speaks first — but she stops rather than talk
   * at a wall.
   *
   * Five unanswered lines is the limit, counted from the transcript, so the
   * greeting and any scene she opened count towards it: from his side they are
   * all her talking into the same silence. The count clears the moment he says
   * anything, which is the point — the old rule was two nudges per *encounter*
   * and never reset, so an hour into a real conversation she had permanently
   * lost the ability to speak first.
   */
  private armIdleNudge(): void {
    window.clearTimeout(this.idleTimer);
    // Quest scenes own their authored silences. Open Chat's 30-second nudge
    // must not speak over a clue, choice or interruption window.
    if (store.get().activeQuestId) return;
    if (store.unansweredLines >= MAX_UNANSWERED) return;
    this.idleTimer = window.setTimeout(() => this.speakIntoSilence(), 30000);
  }

  private cancelIdleNudge(): void {
    window.clearTimeout(this.idleTimer);
  }

  private speakIntoSilence(): void {
    const s = store.get();
    if (s.step !== 'stage' || s.activeQuestId || store.unansweredLines >= MAX_UNANSWERED) return;
    if (s.thinking || s.voicing || s.speaking || s.reveal) {
      this.armIdleNudge();
      return;
    }
    const route = resolveCanonRoute();
    const r = canonViewFor(s.residentId, route);
    // Only the phrasing rotates off this; the stopping rule is the count above.
    const spokenIndex = this.idleSpoken;
    this.idleSpoken++;
    const conversation = this.conversationToken();

    const ctx = {
      resident: r,
      session: effectivePromptSession(s.session, 'open-chat'),
      revealed: s.revealed,
      memories: store.progressFor(s.residentId).memories,
      turn: s.turns,
    };
    const chatLength = s.chat.length;
    void getReply(idleLine(r, spokenIndex, route), ctx, s.chat, {
      idle: true,
      mode: 'open-chat',
      level: store.level,
      story: storyContext(s.residentId, 'open-chat'),
      bond: s.bond,
      rapport: s.rapport,
    }).then(async (result) => {
      // Do not insert a late nudge after the visitor has started talking, or
      // after the encounter has changed while the request was in flight.
      const current = store.get();
      if (
        !this.conversationIsCurrent(conversation) ||
        current.residentId !== s.residentId ||
        current.step !== 'stage' ||
        current.chat.length !== chatLength
      ) {
        return;
      }
      store.set({ thinking: false, voicing: true });
      const prepared = this.speakReply(result.text, s.residentId, conversation);
      store.pushTurn({ from: 'resident', text: result.text });
      this.streamIn(store.get().chat.length - 1, result.text, prepared, true, conversation);
    });
  }

  /**
   * Spoon renders asynchronously. We give it a short head start, then reveal
   * text-only if it is slow rather than letting a late clip talk over an
   * already-read message.
   */
  /**
   * Speak a reply while it is still rendering.
   *
   * Playback begins on the first samples rather than the finished file, so
   * she starts talking about half a second in instead of two to four seconds
   * in. Resolves with the length of what was actually spoken, or null when
   * the stream gave us nothing and the caller should fall back to the
   * whole-file path.
   */
  private async speakStreamed(
    text: string,
    residentId: ResidentId,
    conversation = this.conversationToken()
  ): Promise<number | null> {
    if (this.ambience.isMuted) return null;
    const r = canonViewFor(residentId, resolveCanonRoute());
    const slot = r.voices.find((v) => v.slot === 'signature') ?? r.voices[0];
    const line = spoken(text);
    if (!line) return null;

    const token = ++this.speechToken;
    let stream: ReturnType<Ambience['openStream']> | null = null;
    const seconds = await streamSpeech(
      {
        text: line,
        raw: text,
        voiceId: slot.voiceId,
        speed: slot.speed,
        vol: slot.vol,
      },
      (samples, rate) => {
        if (token !== this.speechToken || !this.conversationIsCurrent(conversation)) return;
        if (!stream) {
          // The first samples are also the moment she starts moving.
          stream = this.ambience.openStream(rate);
          window.clearTimeout(this.speakTimer);
          store.set({ speaking: true, voicing: false });
          this.residentStage?.setSpeaking(true);
        }
        stream.push(samples);
      }
    );

    if (token !== this.speechToken || !this.conversationIsCurrent(conversation)) return seconds;
    if (seconds === null) return null;
    // Hold the speaking pose until the last scheduled piece has played out.
    const tail = stream ? (stream as { end(): number }).end() : seconds;
    this.speakTimer = window.setTimeout(() => {
      if (!this.conversationIsCurrent(conversation)) return;
      store.set({ speaking: false });
      this.residentStage?.setSpeaking(false);
      this.armIdleNudge();
    }, Math.max(0.2, tail) * 1000);
    return seconds;
  }

  /**
   * Say a reply, streaming when the provider can and falling back to the
   * finished file when it cannot. Resolves with how long she spoke.
   */
  private speakReply(
    text: string,
    residentId: ResidentId,
    conversation = this.conversationToken()
  ): Promise<number | null> {
    if (this.ambience.isMuted) return Promise.resolve(null);
    return this.speakStreamed(text, residentId, conversation).then(async (seconds) => {
      if (!this.conversationIsCurrent(conversation)) return null;
      if (seconds !== null) return seconds;
      const buffer = await this.startReplySpeech(text, residentId, false, conversation);
      if (
        !buffer ||
        store.get().residentId !== residentId ||
        !this.conversationIsCurrent(conversation)
      ) return null;
      this.speakPrepared(text, buffer, conversation);
      return buffer.duration;
    });
  }

  private startReplySpeech(
    text: string,
    residentId: ResidentId,
    bump = true,
    conversation = this.conversationToken()
  ): Promise<AudioBuffer | null> {
    if (this.ambience.isMuted) return Promise.resolve(null);
    const r = canonViewFor(residentId, resolveCanonRoute());
    const slot = r.voices.find((v) => v.slot === 'signature') ?? r.voices[0];
    if (bump) this.speechToken++;
    const line = spoken(text);
    if (!line) return Promise.resolve(null);
    return renderSpeech(line, slot.voiceId, slot.speed, text, slot.vol).then(async (url) => {
      if (!url || !this.conversationIsCurrent(conversation)) return null;
      const buffer = await this.ambience.prepareClip(url);
      return this.conversationIsCurrent(conversation) ? buffer : null;
    });
  }

  /**
   * Uncover a line that is already in the chat, word by word, and hand it over
   * to the voice the moment the clip is ready. The pace starts at reading
   * speed and, once the duration is known, stretches or tightens so the last
   * word lands with the last syllable.
   */
  private streamIn(
    index: number,
    text: string,
    /** Resolves with the length of the spoken clip, or null if there is none. */
    prepared: Promise<number | null>,
    /** False when some other path already owns the clip and the voicing flag. */
    ownsVoice = true,
    conversation = this.conversationToken()
  ): void {
    window.clearInterval(this.revealTimer);
    const token = this.speechToken;
    const residentId = store.get().residentId;
    const total = text.trim().split(/\s+/).length;
    let shown = 0;

    const stillMine = () => {
      const s = store.get();
      return (
        s.step === 'stage' &&
        s.residentId === residentId &&
        token === this.speechToken &&
        this.conversationIsCurrent(conversation)
      );
    };
    const run = (stepMs: number) => {
      window.clearInterval(this.revealTimer);
      this.revealTimer = window.setInterval(() => {
        if (!stillMine()) {
          window.clearInterval(this.revealTimer);
          store.set({ reveal: null });
          return;
        }
        shown += 1;
        if (shown >= total) {
          window.clearInterval(this.revealTimer);
          store.set({ reveal: null });
          return;
        }
        store.set({ reveal: { turn: index, words: shown } });
      }, stepMs);
    };

    const guess = (speakingDuration(spoken(text) || text) * 1000) / Math.max(1, total);
    store.set({ reveal: { turn: index, words: 0 } });
    run(Math.min(MAX_WORD_MS, Math.max(MIN_WORD_MS, guess)));

    void prepared.then((seconds) => {
      if (!stillMine()) return;
      if (ownsVoice) store.set({ voicing: false });
      if (!seconds) return;
      // Re-pace what is left so the words and the voice finish together.
      const left = Math.max(1, total - shown);
      run(Math.max(MIN_WORD_MS, (seconds * 1000 * 0.94) / left));
    });
  }

  /** Start a reply that has already been prepared, with text and voice together. */
  private speakPrepared(
    text: string,
    buffer: AudioBuffer | null,
    conversation = this.conversationToken()
  ): void {
    if (!this.conversationIsCurrent(conversation)) return;
    window.clearTimeout(this.speakTimer);
    // Only cancel when we actually have a clip to play. Cancelling on the
    // silent path would abort the render that is still on its way.
    if (buffer) cancelSpeech();
    store.set({ speaking: true });
    this.residentStage?.setSpeaking(true);
    if (buffer) this.ambience.playBuffer(buffer);
    const secs = buffer?.duration ?? speakingDuration(spoken(text) || text);
    this.speakTimer = window.setTimeout(() => {
      if (!this.conversationIsCurrent(conversation)) return;
      store.set({ speaking: false });
      this.residentStage?.setSpeaking(false);
      this.armIdleNudge();
    }, secs * 1000);
  }

  /**
   * Drive a greeting or other pre-existing line. Live chat replies take the
   * prepared path above so their text and voice begin together.
   */
  private speak(
    text: string,
    voiceUrl?: string,
    conversation = this.conversationToken()
  ): void {
    window.clearTimeout(this.speakTimer);
    this.speechToken++;
    cancelSpeech();
    store.set({ speaking: true });
    this.residentStage?.setSpeaking(true);

    const stopAfter = (secs: number) => {
      window.clearTimeout(this.speakTimer);
      this.speakTimer = window.setTimeout(() => {
        if (!this.conversationIsCurrent(conversation)) return;
        store.set({ speaking: false });
        this.residentStage?.setSpeaking(false);
        this.armIdleNudge();
      }, secs * 1000);
    };

    if (voiceUrl) {
      this.ambience.playClip(voiceUrl);
      stopAfter(speakingDuration(spoken(text) || text));
      return;
    }

    stopAfter(speakingDuration(spoken(text) || text));
    if (this.ambience.isMuted) {
      store.set({ voicing: false });
      return;
    }
    store.set({ voicing: true });
    const speakerId = store.get().residentId;
    const r = canonViewFor(speakerId, resolveCanonRoute());
    const slot = r.voices.find((v) => v.slot === 'signature') ?? r.voices[0];
    const line = spoken(text);
    if (!line) {
      store.set({ voicing: false });
      return;
    }
    void renderSpeech(line, slot.voiceId, slot.speed, text, slot.vol).then((url) => {
      if (!this.conversationIsCurrent(conversation)) return;
      store.set({ voicing: false });
      // She may have been swapped out while the audio rendered.
      if (!url || store.get().residentId !== speakerId) return;
      this.ambience.playClip(url);
      store.set({ speaking: true });
      this.residentStage?.setSpeaking(true);
      stopAfter(speakingDuration(spoken(text) || text) + 1);
    });
  }

  leaveUniverse(): void {
    this.rig.cancel();
    this.setTurntableYaw(0, true);
    this.transitionConversation();
    window.clearTimeout(this.genTimer);
    window.clearTimeout(this.editionsTimer);
    this.controls.enabled = false;
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
    this.setPremiumDisplay(false);
    this.premiumRevealToken++;
    this.premiumPending = null;
    this.portalTarget = 0.12;
    this.setPlinthsVisible(false);
    store.leaveUniverse();
    this.rig.applyPreset(CAMERA_PRESETS.gallery);
  }

  // ---------- Companion actions ----------

  /**
   * Warm a model into the browser cache without building any scene.
   *
   * `rel="prefetch"` sits below the playing teaser's range requests, so the
   * film keeps bandwidth priority and the GLB fills the idle remainder of the
   * ~15s window. By the time the film ends and `openStage` asks for the same
   * URL, the bytes are local and `onHeroReady` fires without a download stall.
   * Guarded so re-entering the teaser never stacks duplicate links.
   */
  private prefetchModel(url: string): void {
    const existing = document.head.querySelector(`link[rel="prefetch"][href="${url}"]`);
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'fetch';
    link.href = url;
    document.head.append(link);
  }

  finishCompanionTeaser(): void {
    const s = store.get();
    if (s.step !== 'companion-teaser' || s.companionMode !== 'teaser') return;
    // Once the dissolve has begun, the dolly-out reveal owns completion.
    if (this.companionRevealState !== 'idle') return;
    if (!this.deskHeroReady || !this.centerBaseSettled) {
      this.pendingCompanionFinish = true;
      return;
    }
    this.completeCompanionHandoff();
  }

  private completeCompanionHandoff(): void {
    const s = store.get();
    if (s.step !== 'companion-teaser' || s.companionMode !== 'teaser') return;
    if (this.liveDollyRaf) {
      cancelAnimationFrame(this.liveDollyRaf);
      this.liveDollyRaf = 0;
    }
    // Land on the exact matched framing no matter which path completed it.
    this.applyDolly(this.liveDollyRestVals());
    if (!this.engine.reducedMotion) {
      void this.deskVideo.play().catch(() => {
        // The poster remains a valid static fallback.
      });
    }
    this.companionRevealState = 'done';
    this.pendingCompanionFinish = false;
    store.set({
      step: 'stage',
      companionMode: 'showcase',
      figurineDisplayMode: 'original',
      error: null,
    });
    store.markWaifuUniverseEntered();
    window.clearTimeout(this.editionsTimer);
    this.editionsTimer = window.setTimeout(() => {
      const current = store.get();
      if (current.step === 'stage' && current.companionMode === 'showcase') {
        store.revealEditions();
      }
    }, EDITION_REVEAL_MS);
    this.enableStageOrbit();
  }

  enterPlayground(): void {
    const s = store.get();
    if (s.step !== 'stage' || s.companionMode === 'playground' || s.figurineDisplayMode !== 'original') return;
    window.clearTimeout(this.editionsTimer);
    store.revealEditions();
    store.set({ companionMode: 'playground' });
    this.greet();
  }

  selectKaguraFigurineVariant(id: KaguraFigurineVariantId): void {
    const s = store.get();
    if (
      s.step !== 'stage' ||
      s.residentId !== 'kagura' ||
      ((s.figurineDisplayMode === 'premium' || s.figurineDisplayMode === 'premium-preview') &&
        s.kaguraFigurineVariantId === id)
    ) return;
    this.premiumScanFx?.dispose();
    this.premiumScanFx = null;
    const variant = kaguraFigurineVariantById(id);
    const revealToken = ++this.premiumRevealToken;
    this.residentStage?.hideHero();
    store.set({ kaguraFigurineVariantId: id, figurineDisplayMode: 'premium-preview' });
    this.premiumPending = {
      id,
      token: revealToken,
      modelReady: false,
      videoReady: false,
    };
    void this.residentStage?.loadKaguraVariant(
      variant.id,
      variant.modelUrl,
      variant.glowMapUrl,
      () => {
        if (!this.premiumPending || this.premiumPending.token !== revealToken) return;
        this.premiumPending.modelReady = true;
        this.revealPremiumWhenReady();
      }
    );
    window.setTimeout(() => {
      if (!this.premiumPending || this.premiumPending.token !== revealToken) return;
      this.premiumPending = null;
      store.set({ figurineDisplayMode: 'original' });
      this.residentStage?.setHero('kagura');
      this.flashError('Không tải được figurine premium. Đã quay lại Kagura original.');
    }, 45000);
    this.revealPremiumWhenReady();
  }

  finishKaguraFigurineTransition(id: KaguraFigurineVariantId): void {
    if (!this.premiumPending || this.premiumPending.id !== id) return;
    this.premiumPending.videoReady = true;
    this.revealPremiumWhenReady();
  }

  private revealPremiumWhenReady(): void {
    const pending = this.premiumPending;
    const current = store.get();
    if (
      !pending ||
      !pending.modelReady ||
      !pending.videoReady ||
      pending.token !== this.premiumRevealToken ||
      current.step !== 'stage' ||
      current.residentId !== 'kagura' ||
      current.kaguraFigurineVariantId !== pending.id
    ) return;
    this.premiumPending = null;
    store.set({ figurineDisplayMode: 'premium' });
    this.residentStage!.setKaguraVariantHero(pending.id);
    this.residentStage!.setPremiumInspection(true);
    this.premiumScanFx?.dispose();
    this.premiumScanFx = null;
    const hero = this.residentStage!.heroScanTarget();
    if (hero) {
      this.premiumScanFx = createScanRevealFx(hero, 0xff2038, { duration: 2.0 });
      void this.premiumScanFx.play(this.engine.reducedMotion).then(() => {
        if (this.premiumScanFx) {
          this.premiumScanFx.dispose();
          this.premiumScanFx = null;
        }
      });
    }
    this.setPremiumDisplay(true);
    this.applyStageAccent();
    void this.rig.flyTo(premiumInspectPreset(), this.engine.reducedMotion ? 0 : 0.82);
  }

  returnToOriginalFigurine(): void {
    const s = store.get();
    if (
      s.step !== 'stage' ||
      s.residentId !== 'kagura' ||
      (s.figurineDisplayMode !== 'premium' && s.figurineDisplayMode !== 'premium-preview')
    ) return;
    this.premiumRevealToken++;
    this.premiumPending = null;
    this.premiumScanFx?.dispose();
    this.premiumScanFx = null;
    store.set({ figurineDisplayMode: 'original' });
    this.setPremiumDisplay(false);
    this.residentStage?.setHero('kagura');
    void this.rig.flyTo(stagePreset(), this.engine.reducedMotion ? 0 : 0.82);
  }

  // --- figurine shop (delegates to the store; no payment gateway) ---
  addFigurineToCart(residentId: string, variantId: KaguraFigurineVariantId): void {
    store.addFigurineToCart(residentId, variantId);
  }
  updateCartQty(index: number, qty: number): void {
    store.updateCartQty(index, qty);
  }
  removeFromCart(index: number): void {
    store.removeFromCart(index);
  }
  openCheckout(): void {
    store.openCheckout();
  }
  closeCheckout(): void {
    store.closeCheckout();
  }
  openCollectible(): void {
    store.openCollectible();
  }
  closeCollectible(): void {
    // Any exit from the collectible (× , scrim, or a future Escape/route change)
    // must not strand the premium figurine + inspection camera on the desk.
    const mode = store.get().figurineDisplayMode;
    if (mode === 'premium' || mode === 'premium-preview') this.returnToOriginalFigurine();
    store.closeCollectible();
  }
  viewCollectibleDetail(): void {
    store.viewCollectibleDetail();
  }
  backToCollectibleGrid(): void {
    // Fold the focused figure back to Kagura original before the catalog grid
    // takes the screen again, so the inspection camera + premium hero reset.
    this.returnToOriginalFigurine();
    store.backToCollectibleGrid();
  }
  placeOrder(shipping: ShippingInfo): FigurineOrder | null {
    return store.placeOrder(shipping);
  }
  beginPayment(): void {
    store.beginPayment();
  }
  choosePaymentMethod(method: PaymentMethod): void {
    store.choosePaymentMethod(method);
  }
  confirmPaymentSent(): void {
    store.confirmPaymentSent();
  }
  cancelPaymentSim(): void {
    window.clearTimeout(this.paymentSimTimer);
    store.cancelPaymentSim();
  }
  replayAsReturning(): void {
    window.clearTimeout(this.paymentSimTimer);
    store.replayAsReturning();
    // The store left the transcript empty on purpose; greet() opens on the
    // owner/return greeting instead of resuming the parked conversation.
    this.greet();
  }
  resetDemo(): void {
    window.clearTimeout(this.paymentSimTimer);
    store.resetDemo();
  }
  joinFigurineWaitlist(residentId: string, email: string): void {
    store.joinFigurineWaitlist(residentId, email);
  }

  selectResident(id: string): void {
    if (store.get().step !== 'stage' || store.get().residentId === id) return;
    this.controls.enabled = false;
    this.premiumRevealToken++;
    this.premiumPending = null;
    this.setPremiumDisplay(false);
    this.transitionConversation();
    // Her mood does not travel to the next person on the plinth.
    resetSpeechEmotion();
    this.residentStage?.hideHero();
    store.beginEncounter(id as ResidentId);
    store.set({ figurineDisplayMode: 'original' });
    this.residentStage?.restoreHero();
    void this.residentStage?.load(id, (loadedId) => {
      if (loadedId !== store.get().residentId) return;
      this.residentStage!.setHero(loadedId);
      this.applyStageAccent();
      if (store.get().companionMode === 'playground') this.greet();
    });
    // Picking someone new must not leave the camera frozen.
    this.returnToFront();
    this.picker.setPickSet(this.residentStage?.pickTargets() ?? []);
  }

  sendMessage(text: string): void {
    const s = store.get();
    if (s.thinking) return;
    if (!store.spend('turn')) return;
    const r = canonViewFor(s.residentId, resolveCanonRoute());
    const mode: ConversationMode = s.activeQuestId ? 'quest' : 'open-chat';
    const conversation = this.conversationToken();
    this.cancelIdleNudge();
    this.speechToken++;
    window.clearTimeout(this.speakTimer);
    cancelSpeech();
    this.ambience.stopClip();
    this.restoreOpenChatScene();
    store.set({ speaking: false, voicing: false });
    this.residentStage?.setSpeaking(false);
    if (mode === 'quest') store.pushQuestTurn({ from: 'user', text });
    else store.pushTurn({ from: 'user', text });
    store.completeOnboarding('first-message');
    store.set({ thinking: true });

    const after = store.get();
    const ctx = {
      resident: r,
      session: effectivePromptSession(after.session, mode),
      revealed: after.revealed,
      memories:
        mode === 'quest'
          ? store.approvedForQuest(s.residentId).map((memory) => memory.text)
          : store.progressFor(s.residentId).memories,
      turn: after.turns,
    };
    // History excludes the turn we just pushed; the message is sent separately.
    const history = (mode === 'quest' ? after.questChat : after.chat).slice(0, -1);
    const openQuest = s.activeQuestId ? store.questById2(s.activeQuestId) : undefined;
    const openNode = openQuest
      ? questNode(openQuest, s.activeQuestNodeId ?? openQuest.startNodeId)
      : undefined;

    void getReply(text, ctx, history, {
      mode,
      level: store.level,
      quest: openQuest && openNode && { prompt: openNode.prompt, objective: openQuest.objective },
      story: storyContext(s.residentId, mode),
      approvedCrossMode:
        mode === 'quest'
          ? store.approvedForQuest(s.residentId).map((memory) => memory.text)
          : store.approvedForChat(s.residentId).map((memory) => memory.text),
      bond: s.bond,
      rapport: s.rapport,
    }).then(async (result) => {
      if (!this.conversationIsCurrent(conversation)) return;
      // Trust, desire, respect and irritation carry to the next turn instead of
      // resetting; a missing report keeps whatever was already there.
      store.applyRapport(result.rapport);
      // The line starts arriving the moment the model answers. Its clip is
      // rendered alongside and joins in when it is ready.
      store.set({ thinking: false, voicing: true });
      const replyText = result.text;
      const replyTurn: ChatTurn = { from: 'resident', text: replyText };
      const prepared = this.speakReply(replyText, s.residentId, conversation);
      const committed = mode === 'quest' ? null : store.pushTurn(replyTurn);
      if (mode === 'quest') store.pushQuestTurn(replyTurn);
      if (result.revealedRung !== undefined) {
        store.set({ revealed: result.revealedRung + 1 });
      }
      const visibleChat = mode === 'quest' ? store.get().questChat : store.get().chat;
      this.streamIn(visibleChat.length - 1, replyText, prepared, true, conversation);
      if (mode === 'open-chat') {
        window.setTimeout(() => this.maybeSurfaceBridgeBeat(conversation), 400);
      }
      if (mode === 'open-chat' && committed && result.visualIntent) {
        void this.openChatVisuals.replyCommitted({
          residentId: s.residentId,
          turnId: committed.id,
          userTurn: store.get().turns,
          intent: result.visualIntent,
        });
      }
      // The free encounter ends by offering to keep what was said, not by
      // blocking the conversation mid-sentence.
      // Offer to keep the chapter once there is one worth keeping, rather
      // than at a turn count.
      if (mode === 'open-chat' && store.get().turns === 5) {
        window.setTimeout(() => {
          if (this.conversationIsCurrent(conversation)) store.set({ saveGateOpen: true });
        }, 1200);
      }
    });
  }

  requestOpenChatImage(turnId: string): void {
    const state = store.get();
    if (state.thinking || state.voicing || state.reveal || state.activeQuestId) return;
    void this.openChatVisuals.request(turnId);
  }

  dismissOpenChatImage(turnId: string): void {
    const state = store.get();
    if (state.thinking || state.voicing || state.reveal || state.activeQuestId) return;
    this.openChatVisuals.dismiss(turnId);
  }

  showOpenChatImage(turnId: string): void {
    const state = store.get();
    if (state.activeQuestId) return;
    const visual = state.chat.find((turn) => turn.id === turnId)?.contextVisual;
    if (visual?.status === 'ready' && visual.src) {
      void this.presentOpenChatScene(visual.src);
    }
  }

  openQuests(): void {
    store.set({ questHubOpen: true, walletOpen: false });
  }

  closeQuests(): void {
    store.set({ questHubOpen: false });
  }

  openWallet(): void {
    store.set({ walletOpen: true, questHubOpen: false });
  }

  closeWallet(): void {
    store.set({ walletOpen: false });
  }

  redeemCredits(code: string): 'ok' | 'bad-code' {
    return store.redeem(code);
  }

  dismissCreditError(): void {
    store.set({ broke: null });
  }

  openSessionPanel(): void {
    store.set({ sessionPanelOpen: true });
  }

  closeSessionPanel(): void {
    store.set({ sessionPanelOpen: false });
  }

  private clearQuestSequence(): void {
    this.questSequenceToken++;
    this.thresholdInterruptible = false;
    for (const timer of this.questTimers) window.clearTimeout(timer);
    this.questTimers = [];
  }

  private applyQuestPresentation(presentation?: QuestPresentation): void {
    if (!presentation) return;
    this.controls.enabled = false;
    this.residentStage?.setQuestVisual(
      presentation.visualState,
      presentation.mutation
    );
    void this.rig.flyTo(
      QUEST_CAMERA_PRESETS[presentation.camera],
      this.engine.reducedMotion ? 0 : 1
    );
  }

  private enterQuestPresentation(): void {
    this.controls.enabled = false;
    this.picker.enabled = false;
    // The giant 3D wordmark is showroom furniture, and it sits exactly where the
    // corridor's far wall is. Leaving it up put a translucent "RIN" on top of
    // the Frame 12 reveal, which is the one image Episode 0 exists to deliver.
    this.nameplate.hide();
    this.openChatSceneActive = false;
    delete document.documentElement.dataset.openChatScene;
    this.residentStage?.setQuestMode(true);
    this.ambience.startQuestSoundscape();
  }

  private exitQuestPresentation(): void {
    this.clearQuestSequence();
    this.picker.enabled = false;
    this.ambience.stopQuestSoundscape();
    this.residentStage?.setQuestMode(false);
    const state = store.get();
    this.residentStage?.setHero(state.residentId);
    this.applyStageAccent();
    void this.rig.flyTo(stagePreset(), this.engine.reducedMotion ? 0 : 1.1).then((done) => {
      if (done && store.get().step === 'stage' && !store.get().activeQuestId) {
        this.enableStageOrbit();
        this.picker.enabled = true;
        this.picker.setPickSet(this.residentStage?.pickTargets() ?? []);
      }
    });
  }

  private playThreshold(quest: QuestDefinition): void {
    const threshold = quest.threshold;
    if (!threshold) return;
    this.clearQuestSequence();
    const token = this.questSequenceToken;
    for (const beat of threshold.beats) {
      const timer = window.setTimeout(() => {
        const current = store.get();
        if (
          token !== this.questSequenceToken ||
          current.activeQuestId !== quest.id ||
          current.questPhase !== 'threshold'
        ) {
          return;
        }
        this.thresholdInterruptible = beat.interruptible;
        store.set({ questInterruptible: beat.interruptible });
        this.residentStage?.setQuestVisual(beat.visualState);
        void this.rig.flyTo(
          QUEST_CAMERA_PRESETS[beat.camera],
          this.engine.reducedMotion ? 0 : 0.9
        );
        if (beat.cue) this.ambience.questCue(beat.cue);
        store.pushQuestTurn({ from: 'resident', text: beat.line });
        this.speak(beat.line);
        this.streamIn(
          store.get().questChat.length - 1,
          beat.line,
          Promise.resolve(null),
          false
        );
      }, beat.atMs);
      this.questTimers.push(timer);
    }
    const finish = window.setTimeout(() => {
      const current = store.get();
      if (
        token !== this.questSequenceToken ||
        current.activeQuestId !== quest.id ||
        current.questPhase !== 'threshold'
      ) {
        return;
      }
      this.thresholdInterruptible = false;
      store.set({ questInterruptible: false });
      store.completeQuestThreshold();
      const node = questNode(quest, quest.startNodeId);
      this.applyQuestPresentation(node.presentation);
      store.pushQuestTurn({ from: 'resident', text: node.prompt });
      this.speak(node.prompt);
      this.streamIn(
        store.get().questChat.length - 1,
        node.prompt,
        Promise.resolve(null),
        false
      );
    }, threshold.durationMs);
    this.questTimers.push(finish);
  }

  private showQuestOutcome(choiceId: string): void {
    if (choiceId.includes('open-audio') || choiceId.includes('private-copy')) {
      this.residentStage?.setQuestVisual('frame-open', 'open-channel');
      void this.rig.flyTo(
        QUEST_CAMERA_PRESETS['wide-mutation'],
        this.engine.reducedMotion ? 0 : 1
      );
      return;
    }
    if (choiceId.includes('erase')) {
      this.residentStage?.setQuestVisual('frame-12', 'erase-signature');
      return;
    }
    if (choiceId.includes('quarantine')) {
      this.residentStage?.setQuestVisual('frame-sealed', 'quarantine');
      return;
    }
    if (choiceId.startsWith('freeform:')) {
      this.residentStage?.setQuestVisual('archive-desync', 'desync-motion');
    }
  }

  interruptQuest(): void {
    const s = store.get();
    if (!s.activeQuestId || s.questPhase !== 'threshold' || !this.thresholdInterruptible) return;
    this.thresholdInterruptible = false;
    store.set({ questInterruptible: false });
    this.speechToken++;
    cancelSpeech();
    this.ambience.stopClip();
    window.clearTimeout(this.speakTimer);
    store.set({ speaking: false, voicing: false });
    this.residentStage?.setSpeaking(false);
    const response = 'Em nghe đây. Đi sát em, nhưng đừng để archive chọn thay anh.';
    store.pushQuestTurn({ from: 'resident', text: response });
    this.speak(response);
    this.streamIn(
      store.get().questChat.length - 1,
      response,
      Promise.resolve(null),
      false
    );
  }

  leaveQuest(): void {
    if (!store.get().activeQuestId) return;
    this.transitionConversation();
    store.leaveQuest();
    this.exitQuestPresentation();
  }

  startQuest(id: string): void {
    if (!store.startQuest(id)) return;
    this.transitionConversation();
    // A story scene only enters the conversation after the visitor explicitly
    // starts it from Quest Hub. Close the hub so chat and quest never compete
    // as two simultaneous primary surfaces.
    store.set({ questHubOpen: false });
    this.enterQuestPresentation();
    this.ambience.chime(760);
    // She sets the scene herself. A quest that only changes a badge is a task
    // list; a quest she says out loud is a turn in the conversation.
    const quest = store.questById2(id);
    if (!quest) return;
    const active = store.get();
    if (active.questPhase === 'threshold' && quest.threshold) {
      this.playThreshold(quest);
      return;
    }
    const opening = questNode(
      quest,
      active.activeQuestNodeId ?? quest.startNodeId
    ).prompt;
    // A checkpoint already owns its transcript; do not duplicate the opening
    // when the visitor resumes it.
    if (!active.questChat.length) store.pushQuestTurn({ from: 'resident', text: opening });
    this.speak(opening);
    if (!active.questChat.length) {
      this.streamIn(store.get().questChat.length - 1, opening, Promise.resolve(null), false);
    }
    this.applyQuestPresentation(
      questNode(quest, active.activeQuestNodeId ?? quest.startNodeId).presentation
    );
  }

  chooseQuest(choiceId: string): void {
    const s = store.get();
    const quest = s.activeQuestId ? store.questById2(s.activeQuestId) : undefined;
    if (!quest || s.thinking || s.voicing) return;
    const node = questNode(quest, s.activeQuestNodeId ?? quest.startNodeId);
    const choice = node.choices.find((item) => item.id === choiceId);
    if (!choice || !store.spend('turn')) return;
    this.cancelIdleNudge();
    store.pushQuestTurn({ from: 'user', text: choice.label });
    store.completeOnboarding('first-message');
    const result = store.chooseActiveQuest(choiceId);
    if (!result) {
      store.refund('turn');
      return;
    }
    const reply = result.nextPrompt ?? result.choice.outcome;
    if (result.error === 'ending-unavailable') store.refund('turn');
    store.pushQuestTurn({ from: 'resident', text: reply });
    this.showQuestOutcome(result.choice.id);
    if (!result.completed) {
      const next = questNode(quest, store.get().activeQuestNodeId ?? quest.startNodeId);
      this.applyQuestPresentation(next.presentation);
    }
    this.speak(reply);
    const turn = store.get().questChat.length - 1;
    this.streamIn(turn, reply, Promise.resolve(null), false);
    if (!result.error) {
      void this.questVisuals.outcomeCommitted({
        quest,
        node,
        choice: result.choice,
        turn,
      });
    }
    if (result.completed) {
      this.ambience.chime(980);
    } else {
      this.ambience.chime(680);
    }
  }

  submitQuestAction(action: string): void {
    const text = action.trim();
    const s = store.get();
    const quest = s.activeQuestId ? store.questById2(s.activeQuestId) : undefined;
    if (!text || !quest || s.thinking || s.voicing || !store.canAfford('turn')) {
      if (text && quest && !store.canAfford('turn')) store.set({ broke: 'turn' });
      return;
    }
    const node = questNode(quest, s.activeQuestNodeId ?? quest.startNodeId);
    if (!node.freeform || !store.spend('turn')) return;
    this.cancelIdleNudge();
    store.pushQuestTurn({ from: 'user', text });
    store.completeOnboarding('first-message');
    const result = store.submitQuestAction(text);
    if (!result) {
      store.refund('turn');
      return;
    }
    const reply = result.nextPrompt ?? result.choice.outcome;
    if (result.error === 'ending-unavailable') store.refund('turn');
    store.pushQuestTurn({ from: 'resident', text: reply });
    this.showQuestOutcome(result.choice.id);
    if (!result.completed) {
      const next = questNode(quest, store.get().activeQuestNodeId ?? quest.startNodeId);
      this.applyQuestPresentation(next.presentation);
    }
    this.speak(reply);
    const turn = store.get().questChat.length - 1;
    this.streamIn(turn, reply, Promise.resolve(null), false);
    if (!result.error) {
      void this.questVisuals.outcomeCommitted({
        quest,
        node,
        choice: result.choice,
        turn,
        playerAction: text,
      });
    }
    this.ambience.chime(result.completed ? 980 : 720);
  }

  /** Render a user-authored short line in the active resident's own voice. */
  speakCustomText(text: string): void {
    const line = text.trim();
    const s = store.get();
    if (!line) {
      this.flashError(COPY.stage.voiceMessageEmpty);
      return;
    }
    if (this.ambience.isMuted) return;
    if (s.speaking || s.thinking || s.voicing) return;
    if (!store.canAfford('speakForMe')) {
      store.set({ broke: 'speakForMe' });
      return;
    }

    const residentId = s.residentId;
    const conversation = this.conversationToken();
    const r = canonViewFor(residentId, resolveCanonRoute());
    const slot = r.voices.find((voice) => voice.slot === 'signature') ?? r.voices[0];
    this.cancelIdleNudge();
    store.set({ voicing: true });
    void renderSpeech(line, slot.voiceId, slot.speed, undefined, slot.vol).then(async (url) => {
      if (!this.conversationIsCurrent(conversation) || store.get().step !== 'stage') return;
      const buffer = url ? await this.ambience.prepareClip(url) : null;
      if (!this.conversationIsCurrent(conversation) || store.get().step !== 'stage') return;
      if (!buffer) {
        store.set({ voicing: false });
        this.flashError(COPY.errors.generic);
        this.armIdleNudge();
        return;
      }
      if (!store.spend('speakForMe')) {
        store.set({ voicing: false });
        return;
      }
      store.set({ voicing: false });
      store.completeOnboarding('try-speak-for-me');
      store.pushTurn({ from: 'resident', text: line });
      this.speakPrepared(line, buffer, conversation);
    });
  }

  updateSession(patch: Partial<SessionSetup>): void {
    store.updateSession(patch);
    store.completeOnboarding('set-chat-config');
  }

  resetSession(): void {
    store.resetSession();
  }

  saveChapter(memories: string[]): void {
    if (!store.saveChapter(memories)) return;
    store.completeOnboarding('save-chapter');
    this.ambience.chime(880);
  }

  continueWithoutSaving(): void {
    store.set({ saveGateOpen: false });
  }

  /** Ease back to the framing she is posed for, and hand control back. */
  private returnToFront(): void {
    this.controls.enabled = false;
    this.setTurntableYaw(0, true);
    void this.rig
      .flyTo(stagePreset(), this.engine.reducedMotion ? 0 : 0.7)
      .then((done) => {
        if (done && store.get().step === 'stage') this.enableStageOrbit();
      });
  }

  regenerateLook(prompt: string): void {
    if (!prompt.trim()) {
      this.flashError(COPY.errors.emptyInput);
      return;
    }
    const seed = fnv1a(prompt.trim().toLowerCase());
    this.residentStage?.tintHero(seed);
    store.set({ variantSeed: seed, variantLabel: `Diện mạo ${(seed % 900) + 100}` });
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
          this.revealFx = createScanRevealFx(mate.root, faction.accentColor);
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
    const muted = !this.ambience.isMuted;
    this.ambience.setMuted(muted);
    // The official teaser owns its soundtrack. Keep the persistent chrome
    // toggle authoritative while that media element is mounted.
    document
      .querySelectorAll<HTMLVideoElement>('.stage-teaser-video')
      .forEach((video) => { video.muted = muted; });
    return muted;
  }

  isMuted(): boolean {
    return this.ambience.isMuted;
  }
}

new App();
