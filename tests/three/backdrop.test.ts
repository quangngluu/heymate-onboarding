import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FactionBackdrop } from '../../src/three/backdrop';

describe('Quest scene backdrop', () => {
  it('keeps the previous scene when a replacement image cannot load', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 80);
    const skyline = new THREE.Group();
    const first = new THREE.Texture();
    const load = vi
      .fn<(url: string) => Promise<THREE.Texture>>()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('network'));
    const backdrop = new FactionBackdrop(scene, [skyline], load, false, camera);

    await expect(backdrop.showScene('https://images.example/first.jpg')).resolves.toBe(true);
    expect(scene.environment).toBe(first);
    expect(skyline.visible).toBe(false);

    await expect(backdrop.showScene('https://images.example/broken.jpg')).resolves.toBe(false);
    expect(scene.environment).toBe(first);
    expect(skyline.visible).toBe(false);
  });

  it('crossfades into a slow pan and crop-zoom after the scene arrives', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 80);
    camera.position.set(1, 2, 5);
    const texture = new THREE.Texture();
    const backdrop = new FactionBackdrop(scene, [], vi.fn(async () => texture), false, camera);

    await backdrop.showScene('https://images.example/moving.jpg');
    const layer = scene.children.find((object) => {
      const mesh = object as THREE.Mesh;
      return (mesh.material as THREE.MeshBasicMaterial | undefined)?.map === texture;
    }) as THREE.Mesh;
    const material = layer.material as THREE.MeshBasicMaterial;

    backdrop.update(1);
    const startScale = layer.scale.x;
    const startX = layer.position.x;
    backdrop.update(1);

    expect(material.opacity).toBeGreaterThan(0.9);
    expect(layer.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(layer.scale.x).toBeGreaterThan(startScale);
    expect(layer.position.x).not.toBe(startX);
  });

  it('keeps scene motion still when reduced motion is active', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 80);
    const texture = new THREE.Texture();
    const backdrop = new FactionBackdrop(scene, [], vi.fn(async () => texture), true, camera);

    await backdrop.showScene('https://images.example/still.jpg');
    const layer = scene.children.find((object) => {
      const mesh = object as THREE.Mesh;
      return (mesh.material as THREE.MeshBasicMaterial | undefined)?.map === texture;
    }) as THREE.Mesh;
    backdrop.update(1);
    const startScale = layer.scale.clone();
    const startPosition = layer.position.clone();
    backdrop.update(2);

    expect(layer.scale).toEqual(startScale);
    expect(layer.position).toEqual(startPosition);
  });
});
