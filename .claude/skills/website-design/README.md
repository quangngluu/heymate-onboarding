# Website Design Skill Pack

Bộ 12 skill đã được lọc để thiết kế và hoàn thiện website. Pack này giữ một core nhỏ, còn skill phụ thuộc stack chỉ được nạp khi đúng điều kiện. Không nên đọc hoặc kích hoạt cả 12 skill cùng lúc.

## Bộ skill

| Nhóm | Skill | Khi dùng |
| --- | --- | --- |
| Core | `frontend-design` | Chốt art direction, typography, palette, layout và signature element trước khi code |
| Core | `responsive-design` | Mobile-first, container queries, fluid layout và responsive QA |
| Polish | `make-interfaces-feel-better` | Review typography, surfaces, icons, motion và chi tiết sau vòng implement đầu tiên |
| QA | `web-interface-guidelines` | Audit accessibility, interaction, content và performance trước khi ship |
| Stack | `tailwind-design-system` | Chỉ khi repo dùng Tailwind CSS v4 hoặc đang migrate lên v4 |
| Stack | `shadcn` | Chỉ khi repo có `components.json` hoặc user yêu cầu shadcn/ui |
| Motion | `gsap-core` | Tween/easing GSAP cơ bản |
| Motion | `gsap-timeline` | Choreography nhiều bước hoặc sequence |
| Motion | `gsap-react` | React/Next.js lifecycle, scope và cleanup |
| Motion | `gsap-scrolltrigger` | Scroll-linked, scrub, pinning hoặc parallax |
| Motion | `gsap-performance` | Tối ưu jank/FPS và kiểm tra animation trên thiết bị yếu |
| Optional | `copywriting` | Homepage, landing page, pricing hoặc feature copy cần conversion |

## Workflow khuyến nghị

1. Đọc brief và codebase hiện tại.
2. Dùng `frontend-design` để lập design plan ngắn trước khi implement.
3. Kiểm tra stack rồi chỉ nạp `tailwind-design-system` hoặc `shadcn` khi điều kiện khớp.
4. Dùng `responsive-design` trong lúc xây layout.
5. Chỉ nạp các skill GSAP cần thiết nếu motion phục vụ mục tiêu cụ thể.
6. Sau vòng implement đầu tiên, dùng `make-interfaces-feel-better` để polish.
7. Trước khi ship, chạy `web-interface-guidelines` và kiểm chứng bằng browser/tests.

Chi tiết routing và thứ tự ưu tiên nằm trong [ROUTER.md](ROUTER.md).

## Cách dùng

### Dùng trực tiếp từ folder

Yêu cầu agent đọc `ROUTER.md`, sau đó đọc đúng `SKILL.md` được router chọn. Cách này không làm thay đổi cấu hình global.

### Cài vào agent

Copy từng thư mục cần dùng dưới `skills/` vào thư mục skill mà agent của bạn hỗ trợ. Không copy toàn bộ nếu dự án không dùng Tailwind, shadcn hoặc GSAP.

Ví dụ cấu trúc đích phổ biến:

```text
.agents/skills/<skill-name>/SKILL.md
.claude/skills/<skill-name>/SKILL.md
```

Không ghi đè một skill đang tồn tại nếu chưa diff nội dung.

## Kiểm tra pack

```bash
node scripts/validate-pack.mjs
```

Validator kiểm tra manifest, tên skill, file bắt buộc, local Markdown links và file `.git` không mong muốn.

## Nguồn và license

Các file skill gốc được giữ nguyên. Riêng `web-interface-guidelines` có wrapper `SKILL.md` nhỏ để chuyển command upstream thành skill portable; checklist gốc nằm nguyên văn trong `references/guidelines.md`.

Commit nguồn, đường dẫn upstream và license được khóa trong [sources.lock.json](sources.lock.json). Bản license đầy đủ nằm trong từng skill hoặc thư mục `licenses/`.
