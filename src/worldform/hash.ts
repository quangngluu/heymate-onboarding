import { fnv1a } from '../util/hash';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function requestHash(value: unknown): string {
  return fnv1a(JSON.stringify(stable(value))).toString(16).padStart(8, '0');
}
