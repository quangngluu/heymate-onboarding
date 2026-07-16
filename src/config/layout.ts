// Plinth arc layout, derived from the faction count — no hard-coded plinth
// count anywhere else. Positions sit on an arc behind the center pedestal.

export const PLINTH_HEIGHT = 0.42;
export const CENTER_PEDESTAL: [number, number, number] = [0, 0, 0];

export function plinthPositions(count: number): [number, number, number][] {
  const radius = count <= 3 ? 3.2 : count <= 4 ? 3.5 : 4.9;
  const spread = count <= 3 ? 1.6 : count <= 4 ? 1.95 : 2.5; // radians across the arc
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
    out.push([Math.sin(t) * radius, 0, -Math.cos(t) * radius]);
  }
  return out;
}
