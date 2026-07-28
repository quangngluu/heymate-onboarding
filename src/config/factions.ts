// Faction content configuration — AFTERBURN CITY.
//
// Design language: one shared "vehicle DNA" reinterpreted four ways —
// fairings → aero shoulder/hip armor, headlights → visor/LED strips,
// tail lights → back light bars, tires → rubber texture cues, speedometer →
// round gauge displays, heat vents → collar/limb vents, vehicle paint →
// glossy enamel + leather + scuffed metal + warning decals.
//
// Scene code reads only from these records — adding a universe/faction
// should not require touching the onboarding engine. No weapons or combat
// props: the collectible DNA forbids them (Vale's baton is intentionally cut).

export type MaterialRole = 'primary' | 'secondary' | 'accent' | 'skin' | 'hair' | 'pedestal' | 'glow';

export interface Palette {
  id: string;
  label: string;
  primary: number;
  secondary: number;
  accent: number;
}

export type AccentKind =
  | 'scarf'
  | 'satchel'
  | 'belt'
  | 'collarTrim'
  | 'shoulderDrape'
  | 'cuffs'
  | 'headPods';

export interface AccentOption {
  id: string;
  label: string;
  kind: AccentKind;
}

export interface SilhouetteSpec {
  // Generic pieces (shared library)
  hood?: boolean;
  strap?: boolean;
  kneePads?: boolean;
  coatSkirt?: boolean;
  highCollar?: boolean;
  vest?: boolean;
  shoulderPanels?: boolean;
  backModule?: boolean;
  // Vehicle-DNA pieces (Afterburn City)
  shoulderFairings?: boolean; // aero shells swept like a bike fairing
  ledStrip?: boolean; // light bar chest → shoulder
  backHelmet?: boolean; // full-face helmet clipped on the back
  asymShoulder?: boolean; // one oversized cut-fender pauldron
  scrapPanels?: boolean; // asymmetric salvaged armor plates
  beltGauge?: boolean; // round speedometer display on the belt
  neckRing?: boolean; // magnetic-field ring around the neck
  wristRings?: boolean; // paired rings at the wrists
  sensoryCrown?: boolean; // low sensory hood/crown band
  glowSeam?: boolean; // energy seam running down the torso
}

export type EmblemGlyph = 'chevron' | 'jaw' | 'gauge' | 'halo';

export interface RosterEntry {
  name: string;
  title: string;
}

export interface FactionConfig {
  id: string;
  name: string;
  belief: string;
  traits: [string, string, string];
  personality: string;
  /** Champion figurine (roster[0]) + supporting cast for future expansion. */
  roster: RosterEntry[];
  /** UI + rim-light accent. */
  accentColor: number;
  palettes: [Palette, Palette, Palette];
  /** Locked faction silhouette — never editable by the user. */
  silhouette: SilhouetteSpec;
  accents: [AccentOption, AccentOption, AccentOption];
  emblem: EmblemGlyph;
}

export const FACTIONS: FactionConfig[] = [
  {
    id: 'red-shift',
    name: 'RED//SHIFT',
    belief: 'Tốc độ là tự do. Thành phố không thể nhốt thứ nó không bắt kịp.',
    traits: ['Tự do', 'Nhanh', 'Trung thành'],
    personality: 'Những tay lái đường phố đưa dữ liệu qua các khu bị phong toả.',
    roster: [
      { name: 'Rex', title: 'Đội trưởng đường trường' },
      { name: 'Kira', title: 'Người chạy tín hiệu' },
    ],
    accentColor: 0xd8402c,
    palettes: [
      { id: 'signal-run', label: 'Chạy theo tín hiệu', primary: 0xc2261f, secondary: 0x26282d, accent: 0xf2eee0 },
      { id: 'ivory-lap', label: 'Vòng chạy ngà', primary: 0xe9e2d2, secondary: 0xc2261f, accent: 0x26282d },
      { id: 'night-circuit', label: 'Mạch đêm', primary: 0x26282d, secondary: 0xc2261f, accent: 0xf2eee0 },
    ],
    silhouette: { shoulderFairings: true, ledStrip: true, kneePads: true, backHelmet: true },
    accents: [
      { id: 'courier-pack', label: 'Túi chuyển phát', kind: 'satchel' },
      { id: 'racing-belt', label: 'Đai đua', kind: 'belt' },
      { id: 'rider-scarf', label: 'Khăn của tay lái', kind: 'scarf' },
    ],
    emblem: 'chevron',
  },
  {
    id: 'razorpack',
    name: 'RAZORPACK',
    belief: 'Mọi thứ hỏng đều thuộc về chúng ta.',
    traits: ['Hoang dã', 'Tháo vát', 'Ồn ào'],
    personality: 'Những tay lái nhặt phế liệu và hàn xác xe thành giáp.',
    roster: [
      { name: 'Grind', title: 'Thủ lĩnh bầy đàn' },
      { name: 'Hex', title: 'Thợ máy tai nạn' },
    ],
    accentColor: 0xc9d426,
    palettes: [
      { id: 'acid-rush', label: 'Cơn lốc axit', primary: 0x1f2023, secondary: 0xc9d426, accent: 0xc26a1f },
      { id: 'rust-heap', label: 'Đống rỉ sét', primary: 0x8a4a1c, secondary: 0x1f2023, accent: 0xc9d426 },
      { id: 'hazard-line', label: 'Vạch nguy hiểm', primary: 0xb9c322, secondary: 0x1f2023, accent: 0x8a4a1c },
    ],
    silhouette: { asymShoulder: true, scrapPanels: true, kneePads: true },
    accents: [
      { id: 'scrap-pouch', label: 'Túi phế liệu', kind: 'satchel' },
      { id: 'weld-cuffs', label: 'Vòng tay hàn', kind: 'cuffs' },
      { id: 'ear-guards', label: 'Chụp tai bảo hộ', kind: 'headPods' },
    ],
    emblem: 'jaw',
  },
  {
    id: 'ward-9',
    name: 'WARD-9',
    belief: 'Trật tự là một dịch vụ. Chúng ta giao đúng hạn.',
    traits: ['Lạnh lùng', 'Chính xác', 'Không khoan nhượng'],
    personality: 'Đơn vị kiểm soát đô thị và thu hồi công nghệ theo hợp đồng.',
    roster: [
      { name: 'Vale', title: 'Chỉ huy thu hồi' },
      { name: 'Unit K-6', title: 'Sĩ quan truy đuổi' },
    ],
    accentColor: 0xb32020,
    palettes: [
      { id: 'ceramic-order', label: 'Trật tự gốm sứ', primary: 0xe3e6e8, secondary: 0x3a3f45, accent: 0xb32020 },
      { id: 'graphite-watch', label: 'Canh gác than chì', primary: 0x3a3f45, secondary: 0xe3e6e8, accent: 0xb32020 },
      { id: 'gunmetal-silent', label: 'Thép súng lặng im', primary: 0x596068, secondary: 0xe3e6e8, accent: 0xdde3ea },
    ],
    silhouette: { coatSkirt: true, highCollar: true, shoulderPanels: true, beltGauge: true },
    accents: [
      { id: 'sensor-collar', label: 'Cổ áo cảm biến', kind: 'collarTrim' },
      { id: 'hard-cape', label: 'Nửa áo choàng cứng', kind: 'shoulderDrape' },
      { id: 'utility-rig', label: 'Đai đa dụng', kind: 'belt' },
    ],
    emblem: 'gauge',
  },
  {
    id: 'null-choir',
    name: 'NULL CHOIR',
    belief: 'Thành phố ngân lên. Chúng ta chỉ lắng nghe.',
    traits: ['Bình thản', 'Kỳ lạ', 'Cộng hưởng'],
    personality: 'Những người sống sót từ chương trình thần kinh, được chỉnh theo một tần số vô hình.',
    roster: [
      { name: 'Iona', title: 'Người thấy tần số' },
      { name: 'Echo', title: 'Chủ thể cộng hưởng' },
    ],
    accentColor: 0x9c8fd6,
    palettes: [
      { id: 'bone-hymn', label: 'Thánh ca xương', primary: 0xe8e4da, secondary: 0xb7a6d9, accent: 0x79dfe0 },
      { id: 'lavender-drift', label: 'Trôi trong oải hương', primary: 0xb7a6d9, secondary: 0xe8e4da, accent: 0x79dfe0 },
      { id: 'liquid-chrome', label: 'Chrome lỏng', primary: 0xaeb6bf, secondary: 0xe8e4da, accent: 0xb7a6d9 },
    ],
    silhouette: { neckRing: true, wristRings: true, sensoryCrown: true, glowSeam: true },
    accents: [
      { id: 'resonance-ring', label: 'Vòng cộng hưởng', kind: 'collarTrim' },
      { id: 'containment-cuffs', label: 'Vòng kiềm toả', kind: 'cuffs' },
      { id: 'sensory-pods', label: 'Bộ cảm biến', kind: 'headPods' },
    ],
    emblem: 'halo',
  },
];

export function factionById(id: string): FactionConfig {
  const f = FACTIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown faction: ${id}`);
  return f;
}
