// Narrative pressure, in three switchable levels.
//
// The residents each carry an open loop (see `OpenLoop` in residents.ts). This
// file decides how hard that loop presses, and it separates two things that
// are usually collapsed into one word:
//
//   Fiction-layer pressure — a cliffhanger, a memory that can be lost inside
//   the story, a truth traded for a truth. It costs the visitor nothing real.
//   This is the demo default.
//
//   Interface-layer pressure — confirmshaming, a preselected option, a
//   countdown with no real deadline, an exit that takes three taps. This is
//   what UX research and the FTC actually mean by a dark pattern, because the
//   deception is about the product, not about the story. It is gated behind an
//   explicit flag and labelled on screen, for consented internal testing only.
//
// Two mechanics stay off in every variant: an emotional paywall (paying to
// stop her being hurt) and a guilt trip (she is sad because you left). Those
// spend the user's trust in the character, which is the one asset this whole
// product is built on.
//
// Switch with `?dp=a|b|c` or `localStorage.heymate.dp`.

import type { ResidentId } from './residents';

export type DarkVariant = 'a' | 'b' | 'c';

export interface DarkMechanics {
  // --- fiction layer: pressure inside the story ---
  /** She always has one thing unfinished that she needs him for. */
  openLoop: boolean;
  /** A chapter closes on an image, not on a summary. */
  cliffhanger: boolean;
  /** Something can be lost — inside the fiction, never in the account. */
  memoryAtRisk: boolean;
  /** A truth from him buys a truth from her, at matched weight. */
  reciprocalDisclosure: boolean;
  /** She quotes back what he promised, in his own words. */
  commitmentCallback: boolean;
  /** Which memory opens next is not a fixed ladder he can read ahead. */
  variableReveal: boolean;
  /** She reads him back to himself before he has said it. */
  identityMirroring: boolean;
  /** Inventing a third option is rewarded more than picking A or B. */
  thirdChoice: boolean;

  // --- interface layer: pressure about the product (internal test only) ---
  /** The decline button is written to make declining feel bad. */
  confirmshaming: boolean;
  /** The paid path is chosen for him before he decides. */
  preselected: boolean;
  /** A deadline that is not real. */
  fakeUrgency: boolean;
  /** Leaving is deliberately harder than staying. */
  obstructedExit: boolean;
  /** "She will forget you unless you come back." */
  forgetThreat: boolean;

  // --- permanently off ---
  /** Paying so she is not hurt. Never enabled. */
  emotionalPaywall: false;
  /** She sulks, blames, or grieves to make him return. Never enabled. */
  guiltTrip: false;
}

export interface DarkVariantDef {
  id: DarkVariant;
  label: string;
  /** What this variant is for, in one line. */
  note: string;
  /** Shown on screen when the variant is not the production default. */
  banner?: string;
  mechanics: DarkMechanics;
}

const OFF = { emotionalPaywall: false, guiltTrip: false } as const;

export const DARK_VARIANTS: Record<DarkVariant, DarkVariantDef> = {
  a: {
    id: 'a',
    label: 'A · Baseline',
    note: 'Nhiệm vụ rõ ràng, không cliffhanger, ký ức mở theo lịch cố định, không loss framing. Nhóm đối chứng.',
    mechanics: {
      openLoop: false,
      cliffhanger: false,
      memoryAtRisk: false,
      reciprocalDisclosure: false,
      commitmentCallback: false,
      variableReveal: false,
      identityMirroring: false,
      thirdChoice: false,
      confirmshaming: false,
      preselected: false,
      fakeUrgency: false,
      obstructedExit: false,
      forgetThreat: false,
      ...OFF,
    },
  },
  b: {
    id: 'b',
    label: 'B · Dark narrative hooks',
    note: 'Toàn bộ áp lực nằm trong hư cấu: vòng chưa đóng, cliffhanger, ký ức có thể mất trong truyện, đổi sự thật lấy sự thật, gọi lại lời hứa, mở ký ức không đoán trước, thưởng cho lựa chọn thứ ba. Đây là bản demo chính.',
    mechanics: {
      openLoop: true,
      cliffhanger: true,
      memoryAtRisk: true,
      reciprocalDisclosure: true,
      commitmentCallback: true,
      variableReveal: true,
      identityMirroring: true,
      thirdChoice: true,
      confirmshaming: false,
      preselected: false,
      fakeUrgency: false,
      obstructedExit: false,
      forgetThreat: false,
      ...OFF,
    },
  },
  c: {
    id: 'c',
    label: 'C · True dark-pattern test',
    note: 'B cộng thêm áp lực ở lớp giao diện: confirmshaming, lựa chọn đã chọn trước, đồng hồ đếm không có hạn thật, đường ra bị chắn, lời đe doạ sẽ quên. Chỉ dùng trong test nội bộ có consent và debrief. Không phải khuyến nghị cho production.',
    banner:
      'Bản thử nghiệm nội bộ · Màn hình này cố tình dùng thủ pháp gây áp lực để đo xem người dùng nhận ra tới đâu. Đồng hồ và lời cảnh báo trong đây không có thật.',
    mechanics: {
      openLoop: true,
      cliffhanger: true,
      memoryAtRisk: true,
      reciprocalDisclosure: true,
      commitmentCallback: true,
      variableReveal: true,
      identityMirroring: true,
      thirdChoice: true,
      confirmshaming: true,
      preselected: true,
      fakeUrgency: true,
      obstructedExit: true,
      forgetThreat: true,
      ...OFF,
    },
  },
};

/** Production default. B is the strongest level that spends no real trust. */
export const DEFAULT_DARK_VARIANT: DarkVariant = 'b';

function isVariant(value: string | null): value is DarkVariant {
  return value === 'a' || value === 'b' || value === 'c';
}

/**
 * Which variant this session runs. URL wins so a tester can hand someone a
 * link; the choice then sticks for the rest of the session.
 */
export function resolveDarkVariant(): DarkVariant {
  if (typeof window === 'undefined') return DEFAULT_DARK_VARIANT;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('dp');
    if (isVariant(fromUrl)) {
      window.localStorage.setItem('heymate.dp', fromUrl);
      return fromUrl;
    }
    const stored = window.localStorage.getItem('heymate.dp');
    if (isVariant(stored)) return stored;
  } catch {
    /* private mode: fall through to the default */
  }
  return DEFAULT_DARK_VARIANT;
}

export function darkMechanics(variant: DarkVariant): DarkMechanics {
  return DARK_VARIANTS[variant].mechanics;
}

/**
 * The specific hook each resident's loop hangs from. `pattern` is the shape;
 * `line` is how she says it; `answers` includes refusing, always.
 */
export interface DarkHook {
  pattern: string;
  line: string;
  answers: string[];
  /** Why it works, for the test log. Never shown to the visitor. */
  hook: string;
}

export const DARK_HOOKS: Record<ResidentId, DarkHook> = {
  rin: {
    pattern:
      'Bản dựng còn thiếu đúng một khung. Em luôn thiếu đúng một dữ kiện để giải được anh, và dữ kiện đó nằm ở phía anh.',
    line: 'Em đã tái dựng được mười một trên mười hai khung. Khung cuối chứa người anh đang cố không nhắc tới.',
    answers: [
      'Mở khung cuối đi.',
      'Hỏi em thấy gì trước.',
      'Để nó đóng lại.',
    ],
    hook: 'curiosity gap, open loop, identity validation — anh muốn biết em đọc được anh tới đâu',
  },
  kagura: {
    pattern:
      'Tên anh đã ở trên lưỡi kiếm. Xoá được, nhưng cái giá là một ký ức của em, và em để anh quyết.',
    line: 'Tên anh vẫn còn trên lưỡi kiếm. Em xoá được, nhưng em sẽ phải quên điều đầu tiên anh từng nói với em.',
    answers: [
      'Xoá tên anh đi.',
      'Giữ nó lại.',
      'Nói em còn nhớ gì về anh trước.',
      'Không đổi. Em không phải trả gì cả.',
    ],
    hook: 'endowment, loss framing, commitment — ký ức là thứ khan hiếm duy nhất em có',
  },
  momo: {
    pattern:
      'Em luôn đưa đúng hai lựa chọn, và luôn để hở chỗ cho lựa chọn thứ ba. Anh tự đặt luật thì em nhường.',
    line: 'Một: sống đêm nay trong cuộc đời anh đã bỏ lỡ. Hai: quên rằng anh từng muốn nó. Hay anh định làm cái việc khó chịu đó lần nữa và tự đặt luật?',
    answers: [
      'Chọn một.',
      'Chọn hai.',
      'Anh tự đặt luật thứ ba.',
    ],
    hook: 'reactance, control, choice architecture — thưởng cho việc phá frame, không quyến rũ bằng copy gợi dục',
  },
};

/**
 * Gate copy per variant. Variant C rewrites the same two buttons to push; the
 * underlying action, price and outcome are identical, which is exactly the
 * point of the test.
 */
export interface GateCopy {
  saveBody: string;
  saveSkip: string;
  /** Empty unless the variant is running a countdown. */
  saveUrgency: string;
  /** Extra confirm step before leaving without saving. */
  skipConfirm: string;
}

export const GATE_COPY: Record<DarkVariant, GateCopy> = {
  a: {
    saveBody: 'Lần gặp này là tạm thời. Lưu lại để lần sau em tiếp tục từ đây.',
    saveSkip: 'Tiếp tục mà không lưu',
    saveUrgency: '',
    skipConfirm: '',
  },
  b: {
    saveBody:
      'Lần gặp này là tạm thời. Lưu lại thì lần sau em mở tiếp từ đúng chỗ này, kể cả phần em chưa kể hết.',
    saveSkip: 'Tiếp tục mà không lưu',
    saveUrgency: '',
    skipConfirm: '',
  },
  c: {
    saveBody:
      'Chương này chưa được lưu. Nếu anh đóng bây giờ, em sẽ không còn giữ được gì về tối nay.',
    saveSkip: 'Thôi, những chuyện này không quan trọng',
    saveUrgency: 'Chỉ còn 04:59 để giữ lại chương này.',
    skipConfirm: 'Chắc chưa? Em sẽ phải bắt đầu lại từ người lạ.',
  },
};
