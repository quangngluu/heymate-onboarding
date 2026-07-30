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
import { DARK_HOOKS, DARK_VARIANTS } from '../src/config/dark-patterns';
import { worldFor } from '../src/config/worlds';
import { factsFor } from '../src/config/causal';
import { reactionsFor } from '../src/config/reactions';
import { FANTASIES, PERSONAL_OUTPUTS, STABLE_SOUL, TOGETHER } from '../src/config/bond';

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
  p(`- **Định vị công khai:** ${r.inspiredBy}`);
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
  const w = worldFor(r.id);
  p('### Hình ảnh khoá từ key art');
  p();
  p(`- **Nhìn phát biết:** ${r.keyVisual.silhouette}`);
  p(`- **Trang phục:** ${r.keyVisual.wardrobe}`);
  p(`- **Tóc, mắt:** ${r.keyVisual.features}`);
  p(`- **Thứ quanh người:** ${r.keyVisual.aura}`);
  p(`- **Bảng màu:** ${r.keyVisual.palette}`);
  p(`- **Dàn cảnh:** ${r.keyVisual.staging}`);
  p();
  p('### Thế giới của em');
  p();
  p(w.premise);
  p();
  p('**Mốc thời gian**');
  p();
  for (const e of w.timeline) p(`- **${e.when}** — ${e.what}`);
  p();
  p('**Nơi chốn**');
  p();
  for (const pl of w.places) p(`- **${pl.name}** — ${pl.what} *${pl.detail}*`);
  p();
  p('**Người trong đời em**');
  p();
  for (const pe of w.people) {
    p(`- **${pe.name}** — ${pe.who}`);
    p(`  - *Tình trạng:* ${pe.status}`);
    p(`  - *Chuyện chưa xong:* ${pe.unfinished}`);
  }
  p();
  p('**Luật của thế giới**');
  p();
  for (const rule of w.rules) p(`- ${rule}`);
  p();
  p('**Một ngày bình thường**');
  p();
  for (const d of w.daily) p(`- ${d}`);
  p();
  p('**Từ vựng riêng**');
  p();
  for (const t of w.lexicon) p(`- **${t.term}** — ${t.means}`);
  p();
  p('**Những điều em không biết** (danh sách đóng — em phải nói thật là không biết, không được bịa)');
  p();
  for (const u of w.unknowns) p(`- ${u}`);
  p();
  p('### Ký ức nhân–quả (fact → hành vi)');
  p();
  p('Mỗi mục được retrieve theo cue trong tin nhắn của user, không nhồi hết vào mọi lượt.');
  p();
  for (const f of factsFor(r.id)) {
    p(`**${f.id}** — mở từ mức thân thiết ${f.revealLevel}`);
    p();
    p(`- *Chuyện đã xảy ra:* ${f.fact}`);
    p(`- *Em hiểu nó là:* ${f.privateMeaning}`);
    p(`- *Kết luận sai vẫn đang sống theo:* ${f.falseBelief}`);
    p(`- *Phản xạ để lại:* ${f.behaviors.join(' ')}`);
    p(`- *Bật lên khi:* ${f.triggers.join(' ')}`);
    p(`- *Nghe ra thành:* ${f.evidence.map((e) => `“${e}”`).join(' ')}`);
    p();
  }
  const rx = reactionsFor(r.id);
  p('### Bảng phản ứng');
  p();
  p('| Tình huống | Em làm gì |');
  p('| --- | --- |');
  for (const x of rx.reactions) p(`| ${x.when} | ${x.she} |`);
  p();
  p('### Khi em không đồng ý');
  p();
  for (const x of rx.resists) {
    p(`- **${x.when}**`);
    p(`  - *Em:* ${x.she}`);
    p(`  - *Cửa vẫn mở:* ${x.stillWants}`);
  }
  p();
  p('### Em đoán sai');
  p();
  for (const m of rx.misreads) p(`- ${m}`);
  p();
  p('### Khi gần hơn');
  p();
  p(`- **Điều em muốn:** ${rx.escalation.wants}`);
  p(`- **Khi em bước tới:** ${rx.escalation.initiates}`);
  p(`- **Khi quyền dẫn đổi tay:** ${rx.escalation.handover}`);
  p(`- **Khi em rút lại:** ${rx.escalation.withdraws}`);
  p();
  p('### Những lúc không có gì phải giải quyết');
  p();
  for (const t of TOGETHER[r.id]) p(`- **${t.label}:** ${t.she}`);
  p();
  p('### Góc quan hệ user chọn được');
  p();
  for (const f of FANTASIES.filter((x) => x.residentId === r.id)) {
    p(`- **${f.label}** — ${f.promise}`);
    p(`  - *Nó đổi gì:* ${f.lens}`);
  }
  p();
  p(`**Vật riêng mạch truyện tạo ra:** ${PERSONAL_OUTPUTS[r.id].object}. ${PERSONAL_OUTPUTS[r.id].how}`);
  p();
  p('### Chỗ em không đáng yêu');
  p();
  p(`- **Ích kỷ:** ${r.flaws.selfish}`);
  p(`- **Nói dối:** ${r.flaws.lies}`);
  p(`- **Thao tác:** ${r.flaws.manipulates}`);
  p(`- **Nhỏ nhen:** ${r.flaws.petty}`);
  p();
  p('### Sự gần gũi');
  p();
  p(`- **Thứ làm em nóng lên:** ${r.heat.raisedBy}`);
  p(`- **Khi nó chạm tới:** ${r.heat.whenItLands}`);
  p(`- **Cơ thể nói trước:** ${r.heat.tells}`);
  p(`- **Khi em bước tới:** ${r.heat.initiates}`);
  p(`- **Chỗ em dừng:** ${r.heat.stops}`);
  p(`- **Lớp 18+ (chỉ khi bật flag và xác nhận tuổi):** ${r.heat.explicit}`);
  p();
  p('### Sự thật em đem đổi');
  p();
  p('**Cho không**');
  p();
  for (const t of r.truths.cheap) p(`- ${t}`);
  p();
  p('**Phải nhìn anh một lượt trước khi nói**');
  p();
  for (const t of r.truths.costly) p(`- ${t}`);
  p();
  p('**Chỉ khi em đã quyết định về anh** (mức thân thiết 3+)');
  p();
  for (const t of r.truths.expensive) p(`- ${t}`);
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
  p('### Cái móc tâm lý (nội bộ, không hiện cho người dùng)');
  p();
  p(`- **Hình dạng:** ${DARK_HOOKS[r.id].pattern}`);
  p(`- **Câu demo:** ${DARK_HOOKS[r.id].line}`);
  p('- **Anh có thể đáp:**');
  for (const a of DARK_HOOKS[r.id].answers) p(`  - ${a}`);
  p(`- **Vì sao nó hiệu quả:** ${DARK_HOOKS[r.id].hook}`);
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

p('---');
p();
p('## Stable Soul — phần không ai đổi được');
p();
for (const x of STABLE_SOUL) p(`- ${x}`);
p();
p('User không viết lại con người của em. User định hình con người em trở thành khi ở bên mình.');
p();
p('---');
p();
p('## Mức áp lực kể chuyện (A / B / C)');
p();
p('Đổi bằng `?dp=a|b|c` hoặc `localStorage.heymate.dp`. Mặc định là B.');
p('Chi tiết và lý do tách hai lớp: `docs/waifu-universe-bible.md`.');
p();
for (const v of Object.values(DARK_VARIANTS)) {
  p(`**${v.label}**`);
  p();
  p(v.note);
  if (v.banner) {
    p();
    p(`- *Nhãn hiện trên màn hình:* ${v.banner}`);
  }
  p();
}

writeFileSync(out, L.join('\n'));
console.log(`${out} — ${RESIDENTS.length} nhân vật, ${QUESTS.length} nhiệm vụ, ${L.length} dòng`);
