export type KaguraFigurineVariantId = 'three-d' | 'two-five-d' | 'ink';

export interface KaguraFigurineVariant {
  id: KaguraFigurineVariantId;
  label: string;
  styleLabel: string;
  previewUrl: string;
  modelUrl: string;
  /** Rodin Shaded export, kept separate so the PBR surface stays physically lit. */
  glowMapUrl: string;
  /** The matching authored still used by the full-screen slash reveal. */
  transitionImageUrl: string;
  priceLabel: string;
  sizeLabel: string;
}

/**
 * Three sellable treatments of the same Kagura sculpt. Cards stay lightweight;
 * only the selected GLB is requested by WaifuStage.
 */
export const KAGURA_FIGURINE_VARIANTS: readonly KaguraFigurineVariant[] = [
  {
    id: 'three-d',
    label: 'Crimson Forge',
    styleLabel: '3D EDITION',
    previewUrl: 'assets/figurines/kagura-3d-preview.webp',
    modelUrl: 'assets/figurines/kagura-3d.glb',
    glowMapUrl: 'assets/figurines/kagura-3d-glow.webp',
    transitionImageUrl: 'assets/figurines/kagura-3d-preview.webp',
    priceLabel: '6.999.000 ₫',
    sizeLabel: '15 CM',
  },
  {
    id: 'two-five-d',
    label: 'Red Edge',
    styleLabel: '2.5D EDITION',
    previewUrl: 'assets/figurines/kagura-2-5d-preview.webp',
    modelUrl: 'assets/figurines/kagura-2-5d.glb',
    glowMapUrl: 'assets/figurines/kagura-2-5d-glow.webp',
    transitionImageUrl: 'assets/figurines/kagura-2-5d-preview.webp',
    priceLabel: '6.999.000 ₫',
    sizeLabel: '15 CM',
  },
  {
    id: 'ink',
    label: 'Ink Breaker',
    styleLabel: 'INK EDITION',
    previewUrl: 'assets/figurines/kagura-ink-preview.webp',
    modelUrl: 'assets/figurines/kagura-ink.glb',
    glowMapUrl: 'assets/figurines/kagura-ink-glow.webp',
    transitionImageUrl: 'assets/figurines/kagura-ink-preview.webp',
    priceLabel: '6.999.000 ₫',
    sizeLabel: '15 CM',
  },
] as const;

export const DEFAULT_KAGURA_FIGURINE_VARIANT: KaguraFigurineVariantId = 'three-d';

export function kaguraFigurineVariantById(id: KaguraFigurineVariantId): KaguraFigurineVariant {
  return KAGURA_FIGURINE_VARIANTS.find((variant) => variant.id === id)!;
}
