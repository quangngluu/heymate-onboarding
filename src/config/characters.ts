// Character roster — two per faction, ordered as they stand in the studio.
// modelUrl points at an optimized GLB in public/assets; when a file is
// missing (Kira's model has not been provided yet) the app falls back to the
// clearly-labeled procedural proxy and upgrades automatically once the file
// exists.

export interface CharacterConfig {
  id: string;
  name: string;
  title: string;
  factionId: string;
  bio: string;
  modelUrl: string;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'rex',
    name: 'REX',
    title: 'Đội trưởng đường trường',
    factionId: 'red-shift',
    bio: 'Luôn dẫn đoàn xe từ phía trước, mũ bảo hiểm kẹp bên hông, lộ trình nằm sẵn trong đầu.',
    modelUrl: 'assets/champion-rex.glb',
  },
  {
    id: 'vexa',
    name: 'VEXA',
    title: 'Người chạy tín hiệu',
    factionId: 'red-shift',
    bio: 'Trinh sát các khu bị phong toả và đánh dấu lối hở trước khi bất kỳ ai di chuyển.',
    modelUrl: 'assets/champion-vexa.glb',
  },
  {
    id: 'grind',
    name: 'GRIND',
    title: 'Thủ lĩnh bầy đàn',
    factionId: 'razorpack',
    bio: 'Mặc xác xe vận tải hỏng làm giáp và gọi đó là một cuộc trao đổi công bằng.',
    modelUrl: 'assets/champion-grind.glb',
  },
  {
    id: 'hex',
    name: 'HEX',
    title: 'Thợ máy tai nạn',
    factionId: 'razorpack',
    bio: 'Có thể sửa lại bộ truyền động cháy rụi trong bóng tối, ngay giữa một cuộc cãi vã.',
    modelUrl: 'assets/extra-hex.glb',
  },
  {
    id: 'vale',
    name: 'VALE',
    title: 'Chỉ huy thu hồi',
    factionId: 'ward-9',
    bio: 'Khép lại mọi sự cố trước khi xe đưa tin xuất hiện. Lần nào cũng vậy.',
    modelUrl: 'assets/champion-vale.glb',
  },
  {
    id: 'k6',
    name: 'UNIT K-6',
    title: 'Sĩ quan truy đuổi',
    factionId: 'ward-9',
    bio: 'Được tạo ra để truy đuổi, nhưng vẫn làm giấy tờ đầy đủ.',
    modelUrl: 'assets/extra-k6.glb',
  },
  {
    id: 'iona',
    name: 'IONA',
    title: 'Người thấy tần số',
    factionId: 'null-choir',
    bio: 'Nghe được thành phố thở dưới lớp tiếng xe và ghi lại tất cả.',
    modelUrl: 'assets/champion-iona.glb',
  },
  {
    id: 'echo',
    name: 'ECHO',
    title: 'Chủ thể cộng hưởng',
    factionId: 'null-choir',
    bio: 'Thí nghiệm đã kết thúc, nhưng tín hiệu thì chưa.',
    modelUrl: 'assets/extra-echo.glb',
  },
];

export function characterById(id: string): CharacterConfig {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}

export function characterIndex(id: string): number {
  return Math.max(0, CHARACTERS.findIndex((x) => x.id === id));
}
