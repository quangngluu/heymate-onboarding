import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FactionBackdrop } from '../../src/three/backdrop';

describe('Quest scene backdrop', () => {
  it('keeps the previous scene when a replacement image cannot load', async () => {
    const scene = new THREE.Scene();
    const skyline = new THREE.Group();
    const first = new THREE.Texture();
    const load = vi
      .fn<(url: string) => Promise<THREE.Texture>>()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('network'));
    const backdrop = new FactionBackdrop(scene, [skyline], load);

    await expect(backdrop.showScene('https://images.example/first.jpg')).resolves.toBe(true);
    expect(scene.environment).toBe(first);
    expect(skyline.visible).toBe(false);

    await expect(backdrop.showScene('https://images.example/broken.jpg')).resolves.toBe(false);
    expect(scene.environment).toBe(first);
    expect(skyline.visible).toBe(false);
  });

  it('crossfades into a slow pan and crop-zoom after the scene arrives', async () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const backdrop = new FactionBackdrop(scene, [], vi.fn(async () => texture));

    await backdrop.showScene('https://images.example/moving.jpg');
    const dome = scene.children.find((object) => {
      const mesh = object as THREE.Mesh;
      return (mesh.material as THREE.MeshBasicMaterial | undefined)?.map === texture;
    }) as THREE.Mesh;
    const material = dome.material as THREE.MeshBasicMaterial;
    const startYaw = dome.rotation.y;

    backdrop.update(1);
    backdrop.update(1);

    expect(material.opacity).toBeGreaterThan(0.9);
    expect(dome.rotation.y).not.toBe(startYaw);
    expect(texture.repeat.x).toBeLessThan(1);
    expect(texture.repeat.y).toBeLessThan(1);
  });

  it('keeps scene motion still when reduced motion is active', async () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const backdrop = new FactionBackdrop(scene, [], vi.fn(async () => texture), true);

    await backdrop.showScene('https://images.example/still.jpg');
    const dome = scene.children.find((object) => {
      const mesh = object as THREE.Mesh;
      return (mesh.material as THREE.MeshBasicMaterial | undefined)?.map === texture;
    }) as THREE.Mesh;
    const startYaw = dome.rotation.y;
    backdrop.update(2);

    expect(dome.rotation.y).toBe(startYaw);
    expect(texture.repeat.x).toBe(1);
    expect(texture.repeat.y).toBe(1);
  });
});
