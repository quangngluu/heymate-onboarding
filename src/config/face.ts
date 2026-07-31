// Which face of her the visitor is here for.
//
// Both faces were already authored. Until this existed, every prompt carried all
// of it at once — psyche, ordinary time, heat and cheap truths *and* the world,
// the causal bank, thirty-three reveals and the open loop — about 35,400
// characters per turn. So a visitor who wanted a companion got a mystery
// underneath it, a visitor who wanted the mystery got small talk underneath
// that, and the model averaged the two.
//
// The old answer to that was six configuration axes and twenty-seven options,
// which asked the visitor to tune the mixture. The mixture was the problem. One
// question, asked once, replaces all of it:
//
//   companion — she leads with today, with you, with small things. No open loop,
//               no reveal drip, nothing withheld to be traded later.
//   story     — she leads with what happened to her. World, causal memory,
//               reveals and the quest. This is where an arc can end.
//
// Two things belong to both, deliberately: every safety rule, and `bond`. The
// relationship is earned in either face and carries across the switch, because
// it is the one thing that is genuinely about the pair rather than about which
// mode is open.

export type Face = 'companion' | 'story';

export const DEFAULT_FACE: Face = 'companion';

export const FACES: { readonly id: Face; readonly label: string; readonly hint: string }[] = [
  {
    id: 'companion',
    label: 'Đồng hành',
    hint: 'Em hỏi về ngày của anh, về những thứ nhỏ. Không có bí mật nào bị giữ lại để đổi.',
  },
  {
    id: 'story',
    label: 'Câu chuyện',
    hint: 'Em kể chuyện của em, từng phần một, và có một chỗ để nó kết thúc.',
  },
];

export function isFace(v: unknown): v is Face {
  return v === 'companion' || v === 'story';
}

/**
 * Whether this face may hold something back.
 *
 * The open loop, the reveal drip and the cliffhanger all hang off this one
 * question, so `together` no longer needs to suppress a block that a different
 * axis switched on — the earlier contradiction where the prompt said both "em
 * luôn có một thứ còn dở" and "không mở vòng chưa đóng" in the same breath.
 */
export function withholds(face: Face): boolean {
  return face === 'story';
}

/** Whether canon reveals are on the table at all. */
export function revealsEnabled(face: Face): boolean {
  return face === 'story';
}
