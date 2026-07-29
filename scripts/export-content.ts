// Dump every authored word about the residents into one reviewable document.
//
// The canon is spread across residents.ts (identity, card, profile, episodes,
// curiosity, conversation fingerprint) and quests.ts (scenes and their
// options). Reading it in the source means reading it in fragments, which is
// how content ends up shallower than anyone intended. This writes the whole
// surface out in the order a visitor meets it.
//
// Usage: npx tsx scripts/export-content.ts [out.md]

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESIDENTS } from '../src/config/residents';
import { QUESTS } from '../src/config/quests';

const out = resolve(process.argv[2] ?? 'docs/waifu-content-review.md');
const L: string[] = [];
const p = (s = '') => L.push(s);

p('# Waifu Universe — toàn bộ nội dung đã viết');
p();
p('Xuất tự động từ `src/config/residents.ts` và `src/config/quests.ts`');
p('bằng `npx tsx scripts/export-content.ts`.');
p();
p('Sửa trực tiếp trong file này rồi gửi lại, hoặc ghi chú vào từng mục.');
p();

for (const r of RESIDENTS) {
  p('---');
  p();
  p(`## ${r.name}`);
  p();
  p(`- **Series:** ${r.series}`);
  p(`- **Hình mẫu:** ${r.archetype}`);
  p(`- **Bối cảnh:** ${r.setting}`);
  p(`- **Giọng:** ${r.voices.map((v) => `${v.label} (${v.voiceId}, tốc độ ${v.speed})`).join(', ')}`);
  p();
  p('### Thẻ nhân vật (hiện trên UI)');
  p();
  p(`- **Câu móc:** ${r.card.hook}`);
  p(`- **Tính cách:** ${r.card.personality}`);
  p(`- **Lời hứa với người dùng:** ${r.card.promise}`);
  p();
  p('### Hồ sơ đầy đủ');
  p();
  p(r.profile);
  p();
  p('### Câu chào mở đầu');
  p();
  p(`> ${r.greeting}`);
  p();
  p('### Câu em hỏi khi quan tâm');
  p();
  for (const c of r.curiosity) p(`- ${c}`);
  p();
  p('### Dấu ấn hội thoại');
  p();
  p(`- **Nhịp nói:** ${r.conversation.cadence}`);
  p(`- **Neo vào đời thật:** ${r.conversation.realLife}`);
  p(`- **Khi cảm xúc chạm tới:** ${r.conversation.emotionalTurn}`);
  p(`- **Tránh:** ${r.conversation.avoid}`);
  p();
  p('### Vòng chưa đóng');
  p();
  p(`- **Thứ còn thiếu:** ${r.loop.missing}`);
  p(`- **Em đề nghị:** ${r.loop.offer}`);
  p('- **Ba cách anh đáp:**');
  for (const a of r.loop.answers) p(`  - ${a}`);
  p(`- **Hình ảnh để lại:** ${r.loop.closingImage}`);
  p();
  p('### Bối cảnh cho ảnh sinh tự động');
  p();
  p(`- **Nơi chốn:** ${r.imagery.places}`);
  p(`- **Đồ vật:** ${r.imagery.props}`);
  p(`- **Ánh sáng, chất liệu:** ${r.imagery.air}`);
  p();
  p('### Ký ức (mở dần theo nhiệm vụ)');
  p();
  r.episodes.forEach((e, i) => {
    p(`**${i + 1}. ${e.title}**`);
    p();
    p(`- *Kể trên thẻ:* ${e.body}`);
    p(`- *Em tự nói:* ${e.spoken}`);
    p();
  });
  p('### Nhiệm vụ');
  p();
  for (const q of QUESTS.filter((x) => x.residentId === r.id)) {
    p(`**${q.title}** — mở tới ký ức "${r.episodes[q.rewardEpisode]?.title ?? '(không rõ)'}"`);
    p();
    p(`- *Tóm tắt:* ${q.synopsis}`);
    p(`- *Mục tiêu hiện trên UI:* ${q.objective}`);
    p();
    for (const node of q.nodes) {
      p(`  **Chặng \`${node.id}\`${node.id === q.startNodeId ? ' (mở đầu)' : ''}**`);
      p();
      p(`  - *Em hỏi:* ${node.prompt}`);
      for (const c of node.choices) {
        p(`  - *Anh chọn:* ${c.label}`);
        p(`    - *Kết quả:* ${c.outcome}`);
        if (c.nextNodeId) p(`    - *Đi tiếp tới:* \`${c.nextNodeId}\``);
        if (c.unlockEpisode !== undefined) {
          p(`    - *Mở ký ức:* ${r.episodes[c.unlockEpisode]?.title ?? c.unlockEpisode}`);
        }
      }
      p();
    }
  }
}

writeFileSync(out, L.join('\n'));
console.log(`${out} — ${RESIDENTS.length} nhân vật, ${QUESTS.length} nhiệm vụ, ${L.length} dòng`);
