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
  /** Short ecom blurb shown on the collectible detail card. */
  description: string;
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
    description:
      'Bản dựng 3D đầy đủ khối, bề mặt PBR bóng kim loại — chuẩn trưng bày để soi từng chi tiết giáp đỏ dưới ánh đèn.',
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
    description:
      'Phong cách 2.5D: nét vẽ phẳng hòa cùng chiều sâu nhẹ, giữ nguyên tinh thần minh họa gốc trên khối resin.',
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
    description:
      'Bản mực đơn sắc, tương phản mạnh — chất thủ bản cho tủ sưu tập tối giản, nổi bật đường nét kiếm và tóc.',
  },
] as const;

export const DEFAULT_KAGURA_FIGURINE_VARIANT: KaguraFigurineVariantId = 'three-d';

export function kaguraFigurineVariantById(id: KaguraFigurineVariantId): KaguraFigurineVariant {
  return KAGURA_FIGURINE_VARIANTS.find((variant) => variant.id === id)!;
}

/** "6.999.000 ₫" → 6999000. Keeps `priceLabel` as the source of display truth. */
export function parseVndPrice(label: string): number {
  const digits = label.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

/** 6999000 → "6.999.000 ₫" for computed subtotals. */
export function formatVndPrice(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}
