import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from './three/engine';
import { CameraRig } from './three/rig';
import { buildStage, type StageHandles } from './three/stage';
import { PLINTH_HEIGHT, plinthPositions } from './config/layout';
import { Figurine } from './three/adapter';
import {
  applyVariantTint,
  createGlbChampion,
  GlbChampion,
  loadNormalized,
  loadRawModel,
  type ChampionView,
} from './three/champions';
import { Picker } from './three/picking';
import { createRevealFx, type RevealFx } from './three/reveal';
import { Nameplate } from './three/nameplate';
import { FactionBackdrop } from './three/backdrop';
import { Ambience } from './audio/ambience';
import { store, type Step } from './state/store';
import { mountUI } from './ui/overlay';
import type { UIActions } from './ui/actions';
import { CAMERA_PRESETS } from './config/cameras';
import { COPY } from './config/copy';
import { factionById } from './config/factions';
import { CHARACTERS, characterById, characterIndex } from './config/characters';
import { defaultCustomization } from './config/customization';
import { universeById } from './config/universes';
import { fnv1a } from './util/hash';

const PLINTHS = plinthPositions(CHARACTERS.length);

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

    const universe = universeById(store.get().universeId);
    this.stage = buildStage(
      this.engine.scene,
      universe,
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

    this.picker = new Picker(canvas, this.engine.camera);
    this.picker.onHover = (id) => {
      this.hoveredId = id;
      this.updateLiftTargets();
    };
    this.picker.onPick = (id) => {
      if (store.get().step === 'studio') this.selectCharacter(id);
    };

    this.rig.applyPreset(CAMERA_PRESETS.arrival);
    window.addEventListener('resize', () => this.rig.refreshFov());
    this.engine.onUpdate((dt, t) => this.tick(dt, t));
    this.engine.start();

    let booted = false;
    const off = this.engine.onUpdate(() => {
      if (booted) return;
      booted = true;
      window.setTimeout(() => {
        this.buildCharacters();
        this.loadCenterBase();
        document.getElementById('boot')?.classList.add('is-done');
        off();
      }, 0);
    });

    store.subscribe((s, prev) => {
      if (s.characterId !== prev.characterId || s.step !== prev.step) this.updateLiftTargets();
      this.picker.enabled = s.step === 'studio' && !s.transitioning;
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

  private buildCharacters(): void {
    CHARACTERS.forEach((c, i) => {
      const faction = factionById(c.factionId);
      const proxy = new Figurine(faction);
      proxy.apply(defaultCustomization(faction));
      const [x, , z] = PLINTHS[i];
      proxy.root.position.set(x, PLINTH_HEIGHT, z);
      this.engine.scene.add(proxy.root);
      this.views.set(c.id, proxy);
      this.liftTargets.set(c.id, 0);

      void createGlbChampion(faction, c.modelUrl)
        .then((champ) => {
          const current = this.views.get(c.id);
          if (current !== proxy) return;
          champ.root.position.copy(proxy.root.position);
          this.engine.scene.add(champ.root);
          proxy.dispose();
          this.views.set(c.id, champ);
          this.refreshPickSet();
        })
        .catch(() => {
          console.warn(`Model missing for ${c.id}; proxy figurine stays until the GLB exists.`);
        });
    });
    this.refreshPickSet();
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
    const yaw = Math.atan2(camPos.x - plinth.x, camPos.z - plinth.z);
    this.views.get(id)?.setFacing(yaw);

    void this.rig.flyTo(preset, duration);
  }

  // ---------- UIActions ----------

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
        .catch(() => {
          // Base model missing (e.g. Kira): variant on the proxy figurine.
          const palette = faction.palettes[seed % faction.palettes.length];
          const proxy = new Figurine(faction);
          proxy.apply({ ...defaultCustomization(faction), palette: palette.id });
          return { mate: proxy as ChampionView, label: palette.label };
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
