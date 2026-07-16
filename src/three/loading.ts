// Loading stage shown on a plinth while its character GLB streams in:
// the real collectible pedestal plus a faint holographic column pulsing in
// the faction accent. Replaced in place by the loaded GlbChampion.

import * as THREE from 'three';
import type { FactionConfig } from '../config/factions';
import { buildPedestal, DNA } from './figurine';
import type { ChampionView } from './champions';

export class LoadingPlinth implements ChampionView {
  readonly root = new THREE.Group();
  hoverLift = 0;
  private ringMaterial: THREE.MeshStandardMaterial;
  private holoMat: THREE.MeshBasicMaterial;
  private holo: THREE.Mesh;
  private spinner: THREE.Mesh;
  private spinnerMat: THREE.MeshBasicMaterial;

  constructor(readonly faction: FactionConfig) {
    const ped = buildPedestal(faction.accentColor);
    this.root.add(ped.group);
    this.ringMaterial = ped.ringMaterial;

    this.holoMat = new THREE.MeshBasicMaterial({
      color: faction.accentColor,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.holo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.38, 1.2, 24, 1, true),
      this.holoMat
    );
    this.holo.position.y = DNA.pedestalHeight + 0.62;
    this.root.add(this.holo);

    this.spinnerMat = new THREE.MeshBasicMaterial({
      color: faction.accentColor,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.spinner = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 40, Math.PI * 1.2), this.spinnerMat);
    this.spinner.rotation.x = Math.PI / 2;
    this.spinner.position.y = DNA.pedestalHeight + 0.62;
    this.root.add(this.spinner);
  }

  setFacing(): void {
    /* nothing to turn yet */
  }

  updatePresentation(t: number, phase: number): void {
    this.holoMat.opacity = 0.06 + (Math.sin(t * 2.2 + phase) * 0.5 + 0.5) * 0.07;
    this.spinner.rotation.z = t * 1.6 + phase;
    this.spinner.position.y = DNA.pedestalHeight + 0.62 + Math.sin(t * 1.1 + phase) * 0.05;
    this.ringMaterial.emissiveIntensity = 0.22 + this.hoverLift * 6;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    this.holo.geometry.dispose();
    this.holoMat.dispose();
    this.spinner.geometry.dispose();
    this.spinnerMat.dispose();
    this.ringMaterial.dispose();
  }
}
