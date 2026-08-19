// Transformation scan reveal: a world-space wavefront grows a temporary
// wireframe cage that leads the solid Mate, then the cage burns away and a GPU
// particle burst celebrates the finished figure.
//
// Built from the `build-wireframe-scan-reveal` recipe (MIT). The solid is NOT
// swapped for a full custom ShaderMaterial — `onBeforeCompile` injects a
// discard into the GLB's own materials, so the original lighting survives.
//
// The cage is a coarse edge graph (`EdgesGeometry` at 25°, not a full
// wireframe) sharing one conductor uniform set with the solid, so both fronts
// measure the same world-space radius.

import * as THREE from 'three';
import { GpuParticlePool } from './gpu-particles';

export interface ScanRevealFx {
  play(reducedMotion: boolean): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}

export interface ScanRevealOptions {
  /** Full scan time in seconds before the easing. Defaults to 3.0. */
  duration?: number;
}

type ShaderParams = THREE.WebGLProgramParametersWithUniforms;

/** Format a number as an unambiguous GLSL float literal (avoids int contexts). */
function glslFloat(n: number): string {
  const s = n.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
}

const CAGE_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CAGE_FRAGMENT = /* glsl */ `
  uniform vec3 uScanO;
  uniform float uScanR;
  uniform float uRim;
  uniform float uTrail;
  uniform float uWireOpacity;
  uniform vec3 uColor;

  varying vec3 vWorldPosition;

  void main() {
    float d = distance(vWorldPosition, uScanO);
    float rim = exp(-pow((d - uScanR) / uRim, 2.0));
    float trail = smoothstep(uScanR, uScanR - uTrail, d);
    float alpha = (rim * 1.60 + trail * 0.34) * uWireOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function isShaderMaterial(material: THREE.Material): boolean {
  return (material as THREE.ShaderMaterial).isShaderMaterial === true;
}

export function createScanRevealFx(
  target: THREE.Object3D,
  accentColor: number,
  opts: ScanRevealOptions = {}
): ScanRevealFx {
  const duration = opts.duration ?? 3.0;

  // --- staging: measure the figure in world space -------------------------
  const box = new THREE.Box3().setFromObject(target);
  const size = box.isEmpty()
    ? new THREE.Vector3(1, 1, 1)
    : box.getSize(new THREE.Vector3());
  const diag = Math.max(size.length(), 1e-4);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const maxRadius = diag * 1.6;

  // The recipe's constants are tuned for a form ~1450 skill-units tall. Map
  // them onto the actual figure: amplitude shrinks by k and frequency grows by
  // 1/k, so the wobble keeps its spatial period relative to the figure.
  const k = Math.max(size.y, 1e-3) / 1450;
  const solidLag = 520 * k;
  const rimWidth = 135 * k;
  const trailLength = 950 * k;
  const wobbleAmpA = 36 * k;
  const wobbleAmpB = 17 * k;
  const wobbleFreqAY = 0.011 / k;
  const wobbleFreqAX = 0.007 / k;
  const wobbleFreqBZ = 0.021 / k;
  const wobbleFreqBY = 0.013 / k;

  // Low-left origin just outside the silhouette: a centred origin reads as a
  // loading ring, not a scan sweeping across the form.
  const origin = new THREE.Vector3(
    box.min.x - diag * 0.6,
    box.min.y - diag * 0.12,
    box.min.z - diag * 0.6
  );

  // --- one shared conductor ----------------------------------------------
  // uScanOn lives on the cage too (unused by the cage shader) so the test and
  // any consumer can read completion off the single shared uniform set.
  const uniforms = {
    uScanO: { value: origin },
    uScanR: { value: 0 },
    uScanOn: { value: 1 },
    uWireOpacity: { value: 0 },
    uColor: { value: new THREE.Color(accentColor) },
  };

  // --- solid discard -------------------------------------------------------
  const wobble = `sin(vWorldPosition.y * ${glslFloat(wobbleFreqAY)} + vWorldPosition.x * ${glslFloat(wobbleFreqAX)}) * ${glslFloat(wobbleAmpA)}`
    + ` + sin(vWorldPosition.z * ${glslFloat(wobbleFreqBZ)} + vWorldPosition.y * ${glslFloat(wobbleFreqBY)}) * ${glslFloat(wobbleAmpB)}`;

  target.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of mats) injectDiscard(material);
  });

  function injectDiscard(material: THREE.Material): void {
    if (isShaderMaterial(material)) return;

    const prevCompile = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader: ShaderParams, renderer: THREE.WebGLRenderer) => {
      prevCompile(shader, renderer);
      shader.uniforms.uScanO = uniforms.uScanO;
      shader.uniforms.uScanR = uniforms.uScanR;
      shader.uniforms.uScanOn = uniforms.uScanOn;
      shader.vertexShader =
        'varying vec3 vWorldPosition;\n' +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n\tvWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      shader.fragmentShader =
        'uniform vec3 uScanO;\nuniform float uScanR;\nuniform float uScanOn;\nvarying vec3 vWorldPosition;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
\tif (uScanOn > 0.5 && distance(vWorldPosition, uScanO) > uScanR - ${glslFloat(solidLag)} + ${wobble}) discard;`
        );
    };

    // onBeforeCompile is not in three's program cache key (only the default
    // customProgramCacheKey reflects it via toString). Chain whatever was there
    // and append a marker so the injected program never reuses a pre-scan one.
    const prevKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${prevKey()}|scan-reveal`;
    material.needsUpdate = true;
  }

  // --- wireframe cage ------------------------------------------------------
  const cageMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uScanO: uniforms.uScanO,
      uScanR: uniforms.uScanR,
      uScanOn: uniforms.uScanOn,
      uRim: { value: rimWidth },
      uTrail: { value: trailLength },
      uWireOpacity: uniforms.uWireOpacity,
      uColor: uniforms.uColor,
    },
    vertexShader: CAGE_VERTEX,
    fragmentShader: CAGE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const cageLines: THREE.LineSegments[] = [];
  target.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 25);
    const line = new THREE.LineSegments(edges, cageMaterial);
    line.frustumCulled = false;
    mesh.add(line);
    cageLines.push(line);
  });

  // --- completion burst ----------------------------------------------------
  const pool = new GpuParticlePool(target, {
    capacity: 280,
    life: 1.8,
    size: 0.035,
    color: accentColor,
    mode: 'burst',
  });
  pool.setOpacity(0);
  // Burst in the target's local space; the pool is a child of `target`.
  const burstOrigin = target.worldToLocal(center.clone());

  let t = -1; // -1 = idle until play()
  let elapsed = 0; // monotonic clock for the pool, independent of the scan t
  let resolveDone: (() => void) | null = null;
  let doneTimer: ReturnType<typeof setTimeout> | null = null;
  let reducedMotion = false;
  let done = false;
  let disposed = false;

  function finish(): void {
    if (done) return;
    done = true;
    t = -1;
    uniforms.uScanOn.value = 0;
    uniforms.uWireOpacity.value = 0;
    removeCage();
    // Reduced motion already seeded a still burst on play(); the animated path
    // celebrates with the burst only now that the cage has faded.
    if (!reducedMotion) {
      pool.setOpacity(1);
      pool.burst(burstOrigin, 280, 0.3);
    }
    resolveDone?.();
    resolveDone = null;
  }

  function removeCage(): void {
    for (const line of cageLines) {
      line.parent?.remove(line);
      line.geometry.dispose();
    }
    cageLines.length = 0;
  }

  return {
    play(motionReduced: boolean): Promise<void> {
      reducedMotion = motionReduced;
      t = 0;
      if (motionReduced) {
        // Composed diagnostic still: solid and cage both visible, no advance.
        uniforms.uScanR.value = maxRadius * 0.62;
        uniforms.uWireOpacity.value = 0.85;
        pool.setReducedMotion(true);
        pool.update(0, elapsed);
        pool.setOpacity(0.85);
        pool.burst(burstOrigin, 280, 0.3);
        return new Promise((resolve) => {
          resolveDone = resolve;
          // Resolve on a short path so the flow continues to the reveal step.
          doneTimer = setTimeout(finish, 400);
        });
      }
      pool.setReducedMotion(false);
      pool.setOpacity(0);
      return new Promise((resolve) => {
        resolveDone = resolve;
      });
    },
    update(dt: number): void {
      elapsed += dt;
      pool.update(dt, elapsed);
      if (t < 0 || reducedMotion || disposed) return;
      t += dt;
      const e = Math.min(1, t / duration);
      const ease = 1 - Math.pow(1 - e, 1.35);
      uniforms.uScanR.value = ease * maxRadius;
      uniforms.uWireOpacity.value =
        Math.min(1, e / 0.06) * (1 - smoothstep(0.72, 1, e));
      if (e >= 1) finish();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      removeCage();
      cageMaterial.dispose();
      pool.dispose();
    },
  };
}

/** GLSL smoothstep edge0 < edge1 form, evaluated in JS for the opacity curve. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
