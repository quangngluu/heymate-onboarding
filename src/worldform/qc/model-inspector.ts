import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  GeometryMetadata,
  MateAttachmentSystem,
  ManufacturingProfile,
  QCResult,
  WorldArchetype,
} from '../domain/types';
import { assessGeometry } from './qc';

export interface ModelInspector {
  inspect(input: {
    id: string;
    revisionId: string;
    modelUri: string;
    profile: ManufacturingProfile;
    attachmentSystem: MateAttachmentSystem;
    archetype: WorldArchetype;
    now?: number;
  }): Promise<QCResult>;
}

const MAX_EDGE_CHECK_VERTICES = 250_000;
const MAX_EXACT_TRIANGLES = 300_000;

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

interface GeometryInspection {
  volume: number;
  degenerateFaces: number | null;
  watertight: boolean | null;
  manifold: boolean | null;
}

function inspectBufferGeometry(mesh: THREE.Mesh): GeometryInspection {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  if (!position || position.count < 3) {
    return { volume: 0, degenerateFaces: 0, watertight: null, manifold: null };
  }

  const index = source.index;
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  let volume = 0;
  let degenerate = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const exact = triangleCount <= MAX_EXACT_TRIANGLES;
  const step = exact ? 1 : Math.max(1, Math.ceil(triangleCount / MAX_EXACT_TRIANGLES));

  for (let triangle = 0; triangle < triangleCount; triangle += step) {
    const offset = triangle * 3;
    const ia = index ? index.getX(offset) : offset;
    const ib = index ? index.getX(offset + 1) : offset + 1;
    const ic = index ? index.getX(offset + 2) : offset + 2;
    a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
    cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cross.lengthSq() < 1e-16) degenerate++;
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
  }

  if (position.count > MAX_EDGE_CHECK_VERTICES) {
    return {
      volume: Math.abs(volume) * step,
      degenerateFaces: exact ? degenerate : null,
      watertight: null,
      manifold: null,
    };
  }

  const welded = mergeVertices(source.clone(), 1e-5);
  const weldedPosition = welded.getAttribute('position');
  const weldedIndex = welded.index;
  const edgeCounts = new Map<string, number>();
  const weldedTriangles = Math.floor((weldedIndex?.count ?? weldedPosition.count) / 3);
  for (let triangle = 0; triangle < weldedTriangles; triangle++) {
    const offset = triangle * 3;
    const ia = weldedIndex ? weldedIndex.getX(offset) : offset;
    const ib = weldedIndex ? weldedIndex.getX(offset + 1) : offset + 1;
    const ic = weldedIndex ? weldedIndex.getX(offset + 2) : offset + 2;
    for (const [left, right] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      const key = edgeKey(left, right);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  const counts = [...edgeCounts.values()];
  welded.dispose();
  return {
    volume: Math.abs(volume) * step,
    degenerateFaces: exact ? degenerate : null,
    watertight: counts.length > 0 ? counts.every((count) => count === 2) : null,
    manifold: counts.length > 0 ? counts.every((count) => count <= 2) : null,
  };
}

function emptyGeometry(): GeometryMetadata {
  return {
    meshExists: false,
    nonZeroVolume: null,
    baseDiameterMm: null,
    heightMm: null,
    manifold: null,
    watertight: null,
    disconnectedComponents: null,
    degenerateFaces: null,
    invertedNormals: null,
    baseContact: null,
  };
}

/** Browser GLB adapter: reliable checks are automatic; uncertain checks stay unknown. */
export class BrowserGlbModelInspector implements ModelInspector {
  private readonly loadModel: (uri: string) => Promise<THREE.Object3D>;

  constructor(loadModel?: (uri: string) => Promise<THREE.Object3D>) {
    if (loadModel) {
      this.loadModel = loadModel;
      return;
    }
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.loadModel = async (uri) => (await loader.loadAsync(uri)).scene;
  }

  async inspect(input: {
    id: string;
    revisionId: string;
    modelUri: string;
    profile: ManufacturingProfile;
    attachmentSystem: MateAttachmentSystem;
    archetype: WorldArchetype;
    now?: number;
  }): Promise<QCResult> {
    let geometry = emptyGeometry();
    try {
      const root = await this.loadModel(input.modelUri);
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      const meshes: THREE.Mesh[] = [];
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry?.getAttribute('position')) meshes.push(mesh);
      });

      let lowMinX = Infinity;
      let lowMaxX = -Infinity;
      let lowMinZ = Infinity;
      let lowMaxZ = -Infinity;
      let lowHits = 0;
      const lowCeiling = bounds.min.y + size.y * 0.08;
      const point = new THREE.Vector3();
      for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute('position');
        const step = Math.max(1, Math.ceil(position.count / 200_000));
        for (let i = 0; i < position.count; i += step) {
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          if (point.y > lowCeiling) continue;
          lowHits++;
          lowMinX = Math.min(lowMinX, point.x);
          lowMaxX = Math.max(lowMaxX, point.x);
          lowMinZ = Math.min(lowMinZ, point.z);
          lowMaxZ = Math.max(lowMaxZ, point.z);
        }
      }

      const baseUnits = Math.max(lowMaxX - lowMinX, lowMaxZ - lowMinZ);
      const fullFootprint = Math.max(size.x, size.z);
      const baseDetected =
        lowHits >= 24 &&
        Number.isFinite(baseUnits) &&
        baseUnits > 0 &&
        baseUnits >= fullFootprint * 0.45;
      const uniformScale = baseDetected ? input.profile.base.diameterMm / baseUnits : null;
      const inspections = meshes.map(inspectBufferGeometry);
      const knownWatertight = inspections.every((item) => item.watertight !== null);
      const knownManifold = inspections.every((item) => item.manifold !== null);
      const knownDegenerate = inspections.every((item) => item.degenerateFaces !== null);
      const volume = inspections.reduce((sum, item) => sum + item.volume, 0);

      geometry = {
        meshExists: meshes.length > 0,
        nonZeroVolume: meshes.length > 0 ? volume > 1e-10 : false,
        // The pipeline's normalization is uniform: set the detected base to the
        // profile target and derive height from the same scale.
        baseDiameterMm: uniformScale === null ? null : baseUnits * uniformScale,
        heightMm: uniformScale === null ? null : size.y * uniformScale,
        manifold: knownManifold ? inspections.every((item) => item.manifold) : null,
        watertight: knownWatertight ? inspections.every((item) => item.watertight) : null,
        disconnectedComponents: null,
        degenerateFaces: knownDegenerate
          ? inspections.reduce((sum, item) => sum + (item.degenerateFaces ?? 0), 0)
          : null,
        invertedNormals: null,
        baseContact: baseDetected,
      };
    } catch {
      // A model that cannot be fetched or parsed is not silently approved.
    }

    return assessGeometry({
      id: input.id,
      revisionId: input.revisionId,
      geometry,
      profile: input.profile,
      modularity: {
        attachmentSystem: input.attachmentSystem,
        archetype: input.archetype,
      },
      now: input.now,
    });
  }
}
