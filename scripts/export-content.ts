// Dump every authored word about the residents into one reviewable document.
//
// The canon is spread across residents.ts (identity, card, profile, canonReveals,
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
import { AVATAR_RECOGNITION, CROSSOVER, HUB, arrivalFor } from '../src/config/interlude';
import { canonViewFor } from '../src/config/canon-view';

const routeArg =
  process.argv.find((a) => a.startsWith('--route='))?.slice('--route='.length) ?? 'hub';
if (routeArg !== 'hub' && routeArg !== 'sao') {
  console.error(`Unknown --route=${routeArg}. Expected 'hub' or 'sao'.`);
  process.exit(1);
}
const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
const out = resolve(positional ?? `docs/waifu-content-review.${routeArg}.md`);
const L: string[] = [];
const p = (s = '') => L.push(s);

if (routeArg === 'sao') {
  p('# HeyMates V3 — toàn bộ nội dung runtime');
  p();
  p('Xuất tự động từ route `sao` bằng `npx tsx scripts/export-content.ts --route=sao`.');
  p('Không chứa fallback Hub/v1.');
  p();
  for (const base of RESIDENTS) {
    const r = canonViewFor(base.id, 'sao');
    const k = r.v3!;
    const rx = reactionsFor(r.id, 'sao');
    p('---');
    p();
    p(`## ${r.name}`);
    p();
    p(`- **Series:** ${r.series}`);
    p(`- **Hình mẫu:** ${r.archetype}`);
    p(`- **Bối cảnh:** ${r.setting}`);
    p(`- **Câu móc:** ${r.card.hook}`);
    p(`- **Lời hứa:** ${r.card.promise}`);
    p();
    p('### Nhận diện nhanh');
    p();
    p(k.quickRecognition);
    p();
    p('### Hồ sơ');
    p();
    p(r.profile);
    p();
    p('### Động cơ');
    p();
    p(`- **Mâu thuẫn:** ${r.psyche.contradiction}`);
    p(`- **Muốn:** ${r.psyche.wants}`);
    p(`- **Sợ:** ${r.psyche.fears}`);
    p(`- **Niềm tin sai:** ${r.psyche.falseBelief}`);
    p(`- **Cần học:** ${r.psyche.needsToLearn}`);
    p();
    p('### Visual identity');
    p();
    p(`- **Silhouette:** ${r.keyVisual.silhouette}`);
    p(`- **Wardrobe:** ${r.keyVisual.wardrobe}`);
    p(`- **Features:** ${r.keyVisual.features}`);
    p(`- **Aura:** ${r.keyVisual.aura}`);
    p(`- **Palette:** ${r.keyVisual.palette}`);
    p(`- **Staging:** ${r.keyVisual.staging}`);
    p(`- **Places:** ${r.imagery.places}`);
    p(`- **Props:** ${r.imagery.props}`);
    p(`- **Air:** ${r.imagery.air}`);
    p();
    p('### Thế giới');
    p();
    p(k.world.premise);
    for (const [label, values] of [
      ['Nơi chốn', k.world.places],
      ['Con người', k.world.people],
      ['Luật', k.world.rules],
      ['Đời thường', k.world.daily],
      ['Từ vựng', k.world.lexicon],
      ['Điều chưa biết', k.world.unknowns],
    ] as const) {
      p();
      p(`**${label}**`);
      for (const value of values) p(`- ${value}`);
    }
    p();
    p('### Canon reveals');
    p();
    r.canonReveals.forEach((item, index) => {
      p(`**${index + 1}. ${item.title}** (\`${item.id}\`)`);
      p(`- ${item.body}`);
      p(`- *Em nói:* “${item.spoken}”`);
      p();
    });
    p('### Sự thật đem đổi');
    p();
    for (const [tier, values] of [
      ['Cho không', r.truths.cheap],
      ['Có giá', r.truths.costly],
      ['Đắt', r.truths.expensive],
    ] as const) {
      p(`**${tier}**`);
      for (const value of values) p(`- ${value}`);
      p();
    }
    p('### Ký ức nhân quả');
    p();
    for (const fact of r.causalFacts) {
      p(`**${fact.id}** — mức ${fact.revealLevel}`);
      p(`- *Fact:* ${fact.fact}`);
      p(`- *Ý nghĩa riêng:* ${fact.privateMeaning}`);
      p(`- *Niềm tin sai:* ${fact.falseBelief}`);
      p(`- *Phản xạ:* ${fact.behaviors.join(' ')}`);
      p(`- *Trigger:* ${fact.triggers.join(' ')}`);
      p(`- *Giọng:* ${fact.evidence.map((line) => `“${line}”`).join(' ')}`);
      p();
    }
    p('### Heat register');
    p();
    p(`- **Raised by:** ${r.heat.raisedBy}`);
    p(`- **When it lands:** ${r.heat.whenItLands}`);
    p(`- **Tells:** ${r.heat.tells}`);
    p(`- **Initiates:** ${r.heat.initiates}`);
    p(`- **Stops:** ${r.heat.stops}`);
    p(`- **Explicit:** ${r.heat.explicit}`);
    p();
    p('### Phản ứng và ranh giới');
    p();
    for (const reaction of rx.reactions) p(`- **${reaction.when}:** ${reaction.she}`);
    for (const refusal of rx.resists) {
      p(`- **${refusal.when}:** ${refusal.she} *Cửa còn mở:* ${refusal.stillWants}`);
    }
    p();
    p('### Quest theo route');
    p();
    const quests = QUESTS.filter((quest) => quest.residentId === r.id && quest.route === 'sao');
    if (!quests.length) {
      p('Chưa có Episode 0 được duyệt. Runtime hiển thị unavailable và không fallback Hub.');
    }
    for (const quest of quests) {
      p(`- **${quest.title}:** ${quest.synopsis}`);
      p(`  - ${quest.nodes.length} cảnh · reveal cuối \`${quest.rewardCanonRevealId}\``);
    }
    p();
  }
  writeFileSync(out, L.join('\n'));
  console.log(`${out} — ${RESIDENTS.length} nhân vật, route sao, ${L.length} dòng`);
  process.exit(0);
}

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
  p(`- **Tuổi:** ${r.age} · **Ngôn ngữ:** ${r.language}`);
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
  p('### Động cơ bên trong (không bao giờ nói thẳng ra)');
  p();
  p(`- **Mâu thuẫn cốt lõi:** ${r.psyche.contradiction}`);
  p(`- **Điều em muốn:** ${r.psyche.wants}`);
  p(`- **Điều em sợ:** ${r.psyche.fears}`);
  p(`- **Điều em tin nhưng không đúng:** ${r.psyche.falseBelief}`);
  p(`- **Điều em đang phải học:** ${r.psyche.needsToLearn}`);
  p();
  p('### Cảm xúc lộ ra mà em không gọi tên');
  p();
  p(`- **Khi em quan tâm:** ${r.tells.caring}`);
  p(`- **Khi em ghen:** ${r.tells.jealous}`);
  p(`- **Khi em ngượng:** ${r.tells.embarrassed}`);
  p();
  p('### Sáu bậc thân thiết (0 → 5)');
  p();
  r.levels.forEach((line, i) => p(`- **Mức ${i}:** ${line}`));
  p();
  p('### Khi anh vào dưới một danh tính khác');
  p();
  p(`- **Cách em nhận ra người ngoài thế giới:** ${r.crossing.detects}`);
  p(`- **Kiểu người khiến em phản ứng mạnh nhất:** ${r.crossing.drawnTo}`);
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
  const a = arrivalFor(r.id);
  p('### Điểm mạnh');
  p();
  for (const x of a.strengths) p(`- ${x}`);
  p();
  if (a.nameBoundary) { p('### Ranh giới về tên'); p(); p(a.nameBoundary); p(); }
  p('### Ranh giới cốt lõi');
  p();
  for (const x of a.boundaries) p(`- ${x}`);
  p();
  p('### Sự cố kéo em tới Interlude Hub');
  p();
  p(a.incident);
  p();
  p('### Plot twist cá nhân');
  p();
  p(a.twist);
  p();
  p('**Hậu quả cảm xúc hiện tại**');
  p();
  for (const c of a.consequence) p(`- **${c.label}:** ${c.text}`);
  p();
  p('### Cách em nhận ra Avatar');
  p();
  for (const x of a.recognitionCues) p(`- ${x}`);
  p();
  p('**Khi anh nhập vai một nhân vật em biết**');
  p();
  for (const x of a.asCharacter) p(`- **${x.when}:** ${x.she}`);
  p();
  p('### Tone theo giai đoạn');
  p();
  for (const x of a.tone) p(`- **${x.stage}:** ${x.text}`);
  p();
  p('### Tiến trình quan hệ');
  p();
  a.progression.forEach((x, i) => p(`${i + 1}. ${x}`));
  p();
  p('### Relationship promise');
  p();
  p(a.promise);
  p();
  p('### Mục tiêu trong Waifu Universe');
  p();
  for (const g of a.goalsSurface) p(`- ${g}`);
  p();
  p(`**Mục tiêu cảm xúc:** ${a.goalEmotional}`);
  p();
  for (const g of a.goalWithUser) p(`- ${g}`);
  p();
  p(`**Arc:** "${a.arc.from}" → "${a.arc.to}"`);
  p();
  p('### Hướng kết thúc khả thi');
  p();
  for (const e of a.endings) p(`- **${e.label}:** ${e.what}`);
  p();
  p('### Canon guardrails');
  p();
  for (const g of a.guardrails) p(`- ${g}`);
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
  p('### Ba câu chào (theo lịch sử quan hệ)');
  p();
  p(`- **Người lạ:** ${r.greeting}`);
  p(`- **Đã gặp lại:** ${r.returnGreeting}`);
  p(`- **Đã cho vào (mức 3+):** ${r.closeGreeting}`);
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
  r.canonReveals.forEach((e, i) => {
    p(`**${i + 1}. ${e.title}**`);
    p();
    p(`- *Kể trên thẻ:* ${e.body}`);
    p(`- *Em tự nói:* ${e.spoken}`);
    p();
  });
  p('### Nhiệm vụ');
  p();
  for (const q of QUESTS.filter((x) => x.residentId === r.id)) {
    p(`**${q.title}** — mở tới ký ức "${r.canonReveals[q.rewardCanonReveal]?.title ?? '(không rõ)'}"`);
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
        if (c.unlockCanonReveal !== undefined) {
          p(`    - *Mở ký ức:* ${r.canonReveals[c.unlockCanonReveal]?.title ?? c.unlockCanonReveal}`);
        }
      }
      p();
    }
  }
}

p('---');
p();
p(`## ${HUB.name}`);
p();
p(HUB.premise);
p();
p(HUB.refuses);
p();
p('**Luật nền**');
p();
HUB.laws.forEach((law, i) => p(`${i + 1}. ${law}`));
p();
p('## Cơ chế nhận diện Avatar');
p();
p(AVATAR_RECOGNITION.signature);
p();
for (const t of AVATAR_RECOGNITION.tiers) p(`- ${t}`);
p();
p('## Nguyên tắc crossover');
p();
for (const c of CROSSOVER) p(`- ${c}`);
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
