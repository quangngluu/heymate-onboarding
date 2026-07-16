/** FNV-1a — stable 32-bit hash used to derive deterministic variant seeds. */
export function fnv1a(input: Uint8Array | string): number {
  let h = 0x811c9dc5;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      h ^= input[i];
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
