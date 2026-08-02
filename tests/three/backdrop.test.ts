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
});
