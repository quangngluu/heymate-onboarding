# Website Design Skill Router

Không load toàn bộ pack. Chọn skill tối thiểu giải quyết đúng bước hiện tại.

> **Entry point cho mọi task UI/design/frontend/motion trong `heymate-onboarding`.**
> Đọc bảng "Project stack status" trước, rồi bảng Routing, rồi mới đọc đúng
> `SKILL.md` được chọn. Không đọc trước cả 12 skill.

## Project stack status — heymate-onboarding

Stack hiện tại: **vanilla Three.js + Vite + TypeScript** (không React, không
Tailwind, không shadcn; motion chạy bằng Three.js `engine.ts`/`rig.ts`, không
GSAP). Trạng thái skill theo stack này:

| Skill | Trạng thái | Ghi chú |
| --- | --- | --- |
| `frontend-design` | **ACTIVE** | Art direction, palette, typography, layout cho UI mới/redesign |
| `responsive-design` | **ACTIVE** | Layout 1440×900 + 390×844 (QA harness đã dùng 2 breakpoint này) |
| `make-interfaces-feel-better` | **ACTIVE** | Polish sau vòng implement đầu |
| `web-interface-guidelines` | **ACTIVE** | Audit a11y/interaction/perf trước ship |
| `copywriting` | **OPTIONAL** | Chỉ khi cần copy onboarding/marketing hướng conversion |
| `tailwind-design-system` | **DORMANT** | Repo không dùng Tailwind — bỏ qua cho tới khi thực sự migrate lên v4 |
| `shadcn` | **DORMANT** | Không có `components.json`/React — chỉ bật nếu repo đổi sang shadcn |
| `gsap-core` / `gsap-timeline` / `gsap-react` / `gsap-scrolltrigger` / `gsap-performance` | **DORMANT** | Motion đang là Three.js. Không thêm GSAP chỉ vì pack có sẵn (xem quy tắc ưu tiên #4). |

Nếu stack đổi (thêm React/Tailwind/shadcn/GSAP), cập nhật bảng này rồi mới nạp
skill tương ứng. Đừng nạp skill DORMANT khi chưa có dependency thật trong repo.

## Routing

| Tình huống | Đọc skill |
| --- | --- |
| Website mới, redesign lớn, hoặc UI đang generic | `skills/frontend-design/SKILL.md` |
| Layout cần chạy tốt trên nhiều kích thước | `skills/responsive-design/SKILL.md` và reference liên quan |
| UI đã chạy nhưng còn “off”, thiếu polish | `skills/make-interfaces-feel-better/SKILL.md`, sau đó chỉ đọc reference đúng category |
| Audit cuối trước khi ship | `skills/web-interface-guidelines/SKILL.md` |
| Tailwind v4 design tokens/component system | `skills/tailwind-design-system/SKILL.md` |
| Repo có `components.json` hoặc yêu cầu shadcn | `skills/shadcn/SKILL.md` |
| Tween/easing GSAP đơn lẻ | `skills/gsap-core/SKILL.md` |
| Sequence/choreography nhiều bước | `skills/gsap-core/SKILL.md` + `skills/gsap-timeline/SKILL.md` |
| GSAP trong React/Next.js | Thêm `skills/gsap-react/SKILL.md` |
| Scroll animation, pinning, scrub, parallax | Thêm `skills/gsap-scrolltrigger/SKILL.md` |
| Jank, FPS hoặc animation nặng | Thêm `skills/gsap-performance/SKILL.md` |
| Marketing copy cho website | `skills/copywriting/SKILL.md` |

## Thứ tự ưu tiên khi có xung đột

1. Yêu cầu cụ thể của user và brief.
2. Code, dependencies, design tokens và conventions đã tồn tại trong repo.
3. Accessibility, reduced motion, semantic HTML và khả năng hoàn thành tác vụ không cần animation.
4. Hướng dẫn API chính thức: `shadcn` cho shadcn và nhóm `gsap-*` cho GSAP.
5. `frontend-design` cho art direction; `make-interfaces-feel-better` cho polish; `web-interface-guidelines` cho final QA.

Không để một skill tự ý thêm dependency hoặc đổi styling system. Nếu dự án đã chọn Motion, Anime.js hoặc CSS animation, không chuyển sang GSAP chỉ vì pack có GSAP.

## Quality gates

- Chưa đọc codebase thì chưa chọn framework-specific skill.
- Mọi animation phải có mục đích, hỗ trợ `prefers-reduced-motion`, cleanup đúng lifecycle và được kiểm tra trên mobile.
- Không dùng preset aesthetic thay cho brand direction.
- Không tuyên bố pass nếu chưa chạy browser/test tương ứng.
