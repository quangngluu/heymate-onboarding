// Logical asset registry. Mirrors the project-root mint-assets.json.
//
// The intended production pipeline is Mint MCP: each faction champion is a
// generated GLB registered here under its stable logical key, with a
// node-name → adapter-role mapping so the customization adapter can bind
// recolor targets and accessory anchors WITHOUT scattering mesh-name checks
// through scene code.
//
// Mint MCP was unavailable in the build session (server not connected), so
// every entry currently resolves to `kind: 'proxy'` — a clearly isolated
// procedural stand-in built by src/three/figurine.ts. Replacing a proxy with
// a real Mint artifact means: sync the GLB via mint-assets.json, set
// kind: 'glb' with its url and roleMap, and the adapter does the rest.

import type { MaterialRole } from './factions';

export type AdapterAnchorName =
  | 'hair'
  | 'face'
  | 'neck'
  | 'chest'
  | 'shoulder'
  | 'hips'
  | 'back'
  | 'pedestal';

export interface GlbRoleMap {
  /** GLB node/material name → recolorable material role. */
  materials: Record<string, MaterialRole>;
  /** GLB node name → adapter anchor. */
  anchors: Record<string, AdapterAnchorName>;
}

export type AssetEntry =
  | { key: string; kind: 'proxy' }
  | { key: string; kind: 'glb'; url: string; roleMap?: GlbRoleMap }
  | { key: string; kind: 'audio'; url: string };

// Champion GLBs are user-provided generated characters (optimized via
// scripts/optimize-glb.mjs: 1024 WebP textures + Meshopt). They are loaded
// as immutable presentation-ready models; the customizable Mate still uses
// the procedural proxy so every customization control stays real.
export const ASSETS: Record<string, AssetEntry> = {
  'faction-red-shift': { key: 'faction-red-shift', kind: 'glb', url: 'assets/champion-rex.glb' },
  'faction-razorpack': { key: 'faction-razorpack', kind: 'glb', url: 'assets/champion-grind.glb' },
  'faction-ward-9': { key: 'faction-ward-9', kind: 'glb', url: 'assets/champion-vale.glb' },
  'faction-null-choir': { key: 'faction-null-choir', kind: 'glb', url: 'assets/champion-iona.glb' },
  // Ambience is procedural WebAudio while generated audio is unavailable.
  'afterburn-city-ambience': { key: 'afterburn-city-ambience', kind: 'proxy' },
};
