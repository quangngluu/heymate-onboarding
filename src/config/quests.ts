import type { ResidentId } from './residents';
import { DEFAULT_ROUTE, type CanonRoute } from './canon-route';

export interface QuestChoice {
  id: string;
  label: string;
  /** What actually happened, persisted for later chat callbacks. */
  outcome: string;
  nextNodeId?: string;
  flag: string;
  /** Opens one canonical reveal as this part of the arc is discovered. */
  unlockCanonReveal?: number;
  /** Stable route-owned reveal. Required on v3 quests; numeric stays for Hub saves. */
  unlockCanonRevealId?: string;
  /**
   * Names the ending this branch lands on, for a choice that ends the quest.
   *
   * Required on every terminal choice of a v3 quest — `verify-canon` enforces it,
   * and that the id resolves against the resident's authored endings. Before
   * this, a quest simply stopped: the arc's landing existed as authored content
   * nothing could reach, and the "kết cục" count on the card was derived from the
   * shape of the graph rather than from what was written.
   */
  endingId?: string;
  /** Hook for a future generated scene; no asset is implied today. */
  imageKey?: string;
  /**
   * True when the player invented this rather than picking it. Written into the
   * canon ledger as player-created canon, which is a different class of fact
   * from a branch the author wrote.
   */
  playerAuthored?: boolean;
  /** Deliberately approved relationship summary that may appear in Open Chat. */
  crossMode?: {
    kind: 'relationship' | 'private-object' | 'oath' | 'nickname' | 'conflict';
    text?: string;
  };
}

/**
 * What an invented action collapses into.
 *
 * The spec's rule is that a user-created solution must get a distinct reaction
 * and a visible state change even when it rejoins the authored spine later. So a
 * family is a real consequence — flag, outcome, optional reveal and scene — not
 * a polite acknowledgement before the story railroads on. `cues` route a typed
 * action here; `fallback` exists because refusing to match must still be an
 * answer rather than a dead end.
 */
export interface FreeformFamily {
  id: string;
  /** Words in the player's own action that route into this consequence. */
  cues: string[];
  /** What happened, in the same voice as an authored outcome. */
  outcome: string;
  flag: string;
  nextNodeId?: string;
  unlockCanonReveal?: number;
  unlockCanonRevealId?: string;
  /** As on QuestChoice: required when this family ends the quest. */
  endingId?: string;
  imageKey?: string;
  crossMode?: QuestChoice['crossMode'];
}

/**
 * The invitation to do something nobody scripted.
 *
 * Present on any node where the player may act instead of choose. `invite` is
 * phrased as an opening, never as a third button, because the moment it reads as
 * an option it stops being free-form.
 */
export interface FreeformAffordance {
  invite: string;
  families: FreeformFamily[];
  /** Used when nothing matches. Still a consequence; never a refusal to react. */
  fallback: FreeformFamily;
}

export type QuestCamera =
  | 'follow'
  | 'side-composition'
  | 'object-pov'
  | 'close-encounter'
  | 'wide-mutation';

export interface QuestPresentation {
  camera: QuestCamera;
  ambience: string[];
  visualState: 'archive-corridor' | 'frame-12' | 'archive-desync' | 'frame-open' | 'frame-sealed';
  objective?: string;
  /** Authored mutation shown immediately; generated art may replace it later. */
  mutation?: 'activate-frame' | 'desync-motion' | 'open-channel' | 'erase-signature' | 'quarantine';
}

export interface QuestThresholdBeat {
  atMs: number;
  camera: QuestCamera;
  line: string;
  interruptible: boolean;
  visualState: QuestPresentation['visualState'];
  cue?: 'footsteps' | 'frame-tick' | 'dropout';
}

export interface QuestEpisode {
  id: string;
  number: 0 | 1 | 2;
  title: string;
  purpose: string;
}

export interface QuestNode {
  id: string;
  prompt: string;
  /**
   * Seeds, not a closed list.
   *
   * This was a two-item tuple, which made the authored spine binary and
   * structurally forbade the thing the design is built on — Momo's third rule,
   * Rin's three-way frame decision, and the `thirdChoice` mechanic the prompt
   * already rewards. A list of any length, plus `freeform` below, is what lets
   * "invent your own" be a real branch rather than a line of encouragement.
   */
  choices: QuestChoice[];
  freeform?: FreeformAffordance;
  presentation?: QuestPresentation;
}

/**
 * Resolve a typed action into a consequence.
 *
 * Cue matching is deliberately dumb and local: it runs before any model call so
 * a free-form action always lands somewhere, even offline. The model's job is to
 * voice the reaction, not to decide whether the world changed.
 */
export function resolveFreeform(node: QuestNode, action: string): QuestChoice | null {
  const free = node.freeform;
  if (!free) return null;
  const said = action.toLowerCase();
  const hit =
    free.families.find((f) => f.cues.some((cue) => said.includes(cue.toLowerCase()))) ??
    free.fallback;
  return {
    id: `freeform:${hit.id}`,
    label: action.trim().slice(0, 120),
    outcome: hit.outcome,
    flag: hit.flag,
    nextNodeId: hit.nextNodeId,
    unlockCanonReveal: hit.unlockCanonReveal,
    unlockCanonRevealId: hit.unlockCanonRevealId,
    endingId: hit.endingId,
    imageKey: hit.imageKey,
    playerAuthored: true,
    crossMode: hit.crossMode,
  };
}

/**
 * One resident owns one authored arc. Nodes carry the plot; the final node
 * completes the quest, while earlier choices reveal canon progressively.
 */
export interface QuestDefinition {
  id: string;
  residentId: ResidentId;
  route: CanonRoute;
  kind: 'story';
  title: string;
  synopsis: string;
  objective: string;
  canonRef: string[];
  startNodeId: string;
  nodes: QuestNode[];
  /** Playable chapters; distinct from resident canon reveals. */
  questEpisodes?: QuestEpisode[];
  /** Episode 0 threshold. Authored and time-based, never generated. */
  threshold?: {
    durationMs: number;
    checkpoint: string;
    beats: QuestThresholdBeat[];
  };
  /** The last canonical memory reveal this complete arc can open. */
  rewardCanonReveal: number;
  rewardCanonRevealId?: string;
}

export const QUESTS: QuestDefinition[] = [
  {
    id: 'rin-twelfth-frame',
    residentId: 'rin',
    route: 'sao',
    kind: 'story',
    title: 'Frame thứ mười hai',
    synopsis:
      'Archive có mười một chuyển động của Rin. Frame không tồn tại thứ mười hai lại chứa bóng của anh.',
    objective: 'Đi vào Frame 12, tạo một chuyển động archive chưa từng sở hữu và quyết định cách giữ nó.',
    canonRef: ['Hành lang Motion Archive', 'Frame 12', 'Chuyển động không thuộc studio'],
    startNodeId: 'frame-12',
    rewardCanonReveal: 2,
    rewardCanonRevealId: 'rin-v3-fluctlight-clause',
    questEpisodes: [
      {
        id: 'motion-archive-corridor',
        number: 0,
        title: 'Motion Archive Corridor',
        purpose: 'Chuyển mode, dạy ngắt lời và mở disturbance đầu tiên.',
      },
      {
        id: 'the-twelfth-frame',
        number: 1,
        title: 'The Twelfth Frame',
        purpose: 'Đặt anh vào mystery và chứng minh một hành động làm thế giới đổi trạng thái.',
      },
    ],
    threshold: {
      durationMs: 55_000,
      checkpoint: 'threshold_complete',
      beats: [
        {
          atMs: 0,
          camera: 'follow',
          line: 'Đừng chạm vào các frame.',
          interruptible: true,
          visualState: 'archive-corridor',
          cue: 'footsteps',
        },
        {
          atMs: 8_000,
          camera: 'follow',
          line: 'Mười một cái là dữ liệu. Cái cuối cùng… em chưa chắc.',
          interruptible: true,
          visualState: 'archive-corridor',
          cue: 'frame-tick',
        },
        {
          atMs: 22_000,
          camera: 'side-composition',
          line: 'Cái đó không thuộc buổi diễn.',
          interruptible: true,
          visualState: 'archive-desync',
          cue: 'frame-tick',
        },
        {
          atMs: 38_000,
          camera: 'wide-mutation',
          line: '…Anh chưa từng ở đây.',
          interruptible: false,
          visualState: 'frame-12',
          cue: 'dropout',
        },
      ],
    },
    nodes: [
      {
        id: 'frame-12',
        prompt:
          'Timestamp: 02:16. Hai phút sau log chính thức kết thúc. Bóng của anh đứng sát bàn tay archive của em, nhưng hai người không chạm nhau. Anh muốn nhìn dấu chân, kênh headset hay phản ứng của em trước?',
        presentation: {
          camera: 'object-pov',
          ambience: ['server-hum', 'rain-on-glass', 'frame-tick'],
          visualState: 'frame-12',
          objective: 'Tìm chi tiết đầu tiên chứng minh Frame 12 không phải một bản ghi bình thường.',
          mutation: 'activate-frame',
        },
        choices: [
          {
            id: 'inspect-footprint',
            label: 'Anh nhìn dấu chân. Nó hướng vào frame hay đi ra?',
            outcome:
              'Dấu chân của anh có chiều sâu còn bóng người chỉ là dữ liệu. Rin đổi giả thuyết: có thứ từng đứng trong frame, không chỉ được render vào.',
            nextNodeId: 'enter-frame',
            flag: 'rin:priority-footprint',
            unlockCanonReveal: 1,
            unlockCanonRevealId: 'rin-v3-motion-source',
            imageKey: 'rin-frame12-footprint',
          },
          {
            id: 'inspect-headset',
            label: 'Anh mở metadata của kênh headset trước.',
            outcome:
              'Kênh headset đã join trước khi anh giới thiệu tên trong HMU. Rin không gọi đó là trùng hợp nữa.',
            nextNodeId: 'enter-frame',
            flag: 'rin:priority-headset',
            unlockCanonReveal: 1,
            unlockCanonRevealId: 'rin-v3-motion-source',
            imageKey: 'rin-frame12-headset',
          },
          {
            id: 'watch-rin',
            label: 'Anh không nhìn frame. Anh nhìn em đang cố giấu điều gì.',
            outcome:
              'Rin ngừng đọc metadata. Em thừa nhận archived Rin nghiêng đầu sớm hơn mình nửa nhịp — một thói quen studio từng sửa vì khán giả thích.',
            nextNodeId: 'enter-frame',
            flag: 'rin:priority-reaction',
            unlockCanonReveal: 1,
            unlockCanonRevealId: 'rin-v3-motion-source',
            imageKey: 'rin-frame12-reaction',
          },
        ],
      },
      {
        id: 'enter-frame',
        prompt:
          'Camera đi xuyên qua mặt kính vào cảnh thể tích đang đông cứng. Rin đứng ngoài rìa: “Em dựng archive. Em không cần bước vào.” Anh có thể mời em vào, đi trước, lùi lại — hoặc tự làm một điều khác.',
        presentation: {
          camera: 'close-encounter',
          ambience: ['server-hum', 'rain-on-glass', 'electrical-noise'],
          visualState: 'frame-12',
          objective: 'Tạo một phản ứng archive chưa từng ghi lại.',
        },
        choices: [
          {
            id: 'ask-rin-enter',
            label: 'Vào cùng anh. Nếu nó sai, hai đứa sẽ cùng nhìn thấy chỗ sai.',
            outcome:
              'Rin bước vào và chồng chuyển động hiện tại lên bản archive. Hai dáng đứng lệch nhau nửa nhịp; một motion mới xuất hiện mà studio chưa từng sở hữu.',
            nextNodeId: 'desync',
            flag: 'rin:entered-frame',
            imageKey: 'rin-frame12-desync',
          },
          {
            id: 'offer-go-first',
            label: 'Anh đi trước. Em chỉ bước vào khi chính em muốn.',
            outcome:
              'Anh đặt tay vào vùng trống trước. Archive bẻ đường chuyển động để tránh tay anh; Rin bước vào vì quyết định của em, không phải vì bị ép.',
            nextNodeId: 'desync',
            flag: 'rin:player-went-first',
            imageKey: 'rin-frame12-new-motion',
          },
          {
            id: 'withdraw',
            label: 'Không cần chứng minh gì ngay. Anh đứng ngoài với em.',
            outcome:
              'Hai người lùi khỏi frame. Silhouette vẫn tiến một bước về phía kính, tự tạo khoảng cách mới dù không ai ra lệnh.',
            nextNodeId: 'desync',
            flag: 'rin:refusal-changed-frame',
            imageKey: 'rin-frame12-refusal',
          },
        ],
        freeform: {
          invite: 'Hoặc tự làm một điều khác…',
          families: [
            {
              id: 'contradict-archive',
              cues: ['bắt chước', 'làm ngược', 'đổi động tác', 'chuyển động', 'nhảy'],
              outcome:
                'Anh tạo một chuyển động không có trong dữ liệu. Frame cố nội suy rồi vỡ nhịp; Rin bật cười đúng một nhịp mà archive không dự đoán được.',
              flag: 'rin:freeform-contradicted-archive',
              nextNodeId: 'desync',
              imageKey: 'rin-frame12-freeform-motion',
            },
            {
              id: 'address-rin',
              cues: ['gọi rin', 'nói với em', 'nhìn rin', 'đưa tay'],
              outcome:
                'Anh hành động với Rin hiện tại thay vì bản ghi. Archived Rin quay sai hướng; hệ thống đánh dấu một quan hệ mới không có owner.',
              flag: 'rin:freeform-addressed-present-rin',
              nextNodeId: 'desync',
              imageKey: 'rin-frame12-freeform-relation',
            },
          ],
          fallback: {
            id: 'unknown-action',
            cues: [],
            outcome:
              'Archive không hiểu hành động anh vừa tự đặt ra. Nó để lại một vùng dữ liệu trắng có hình đúng bằng khoảng trống giữa anh và Rin.',
            flag: 'rin:freeform-unknown-motion',
            nextNodeId: 'desync',
            imageKey: 'rin-frame12-freeform-unknown',
          },
        },
      },
      {
        id: 'desync',
        prompt:
          'Rin hiện tại và archived Rin đứng lệch nhau. Không còn nhạc. “Bản kia nghiêng đầu sớm hơn em. Studio từng sửa như vậy vì khán giả thích.” Anh đáp lại điều gì?',
        presentation: {
          camera: 'side-composition',
          ambience: ['server-hum', 'silence'],
          visualState: 'archive-desync',
          objective: 'Nói rõ anh đang nhìn Rin nào.',
          mutation: 'desync-motion',
        },
        choices: [
          {
            id: 'notice-present-rin',
            label: 'Anh thấy em đã dừng lại trước khi che frame. Bản kia không biết do dự.',
            outcome:
              'Rin ghi nhận một khác biệt không nằm trong model: em hiện tại có thể do dự rồi vẫn chọn. Respect tăng vì anh quan sát, không định nghĩa hộ em.',
            nextNodeId: 'boundary',
            flag: 'rin:noticed-present-choice',
          },
          {
            id: 'refuse-comparison',
            label: 'Anh không dùng một bản ghi để chấm em thật đến đâu.',
            outcome:
              'Rin đóng bảng so sánh khuôn mặt nhưng giữ motion delta. Em chấp nhận ranh giới mà không vứt bỏ bằng chứng.',
            nextNodeId: 'boundary',
            flag: 'rin:comparison-boundary',
          },
        ],
      },
      {
        id: 'boundary',
        prompt:
          'Rin muốn cô lập chữ ký của anh như dữ liệu. Nếu bị phản đối, em hỏi: “Anh vào hệ thống của em mà không có nguồn. Em phải gọi nó là gì?”',
        presentation: {
          camera: 'close-encounter',
          ambience: ['electrical-noise', 'rain-on-glass'],
          visualState: 'archive-desync',
          objective: 'Đặt ranh giới mà không né bí ẩn.',
        },
        choices: [
          {
            id: 'clear-boundary',
            label: 'Gọi anh là anh. Phân tích dấu vết, nhưng đừng biến người đứng cạnh em thành một mẫu vật.',
            outcome:
              'Rin tách chữ ký khỏi hồ sơ danh tính. Em giữ bằng chứng, bỏ nhãn specimen và tôn trọng ranh giới anh nói rõ.',
            nextNodeId: 'channel-choice',
            flag: 'rin:boundary-clear',
          },
          {
            id: 'accept-analysis',
            label: 'Phân tích đi, nhưng cho anh thấy mọi điều em kết luận.',
            outcome:
              'Rin mở log suy luận song song cho anh. Việc bị quan sát trở thành một thỏa thuận hai chiều thay vì quyền mặc định.',
            nextNodeId: 'channel-choice',
            flag: 'rin:analysis-transparent',
          },
        ],
      },
      {
        id: 'channel-choice',
        prompt:
          'Một kênh âm thanh ẩn bật sáng. Rin hỏi đúng một lần: mở kênh, xoá chữ ký của anh, hay niêm phong Frame 12?',
        presentation: {
          camera: 'object-pov',
          ambience: ['private-channel', 'server-hum'],
          visualState: 'frame-12',
          objective: 'Chọn cách Frame 12 tiếp tục tồn tại.',
        },
        choices: [
          {
            id: 'open-audio',
            label: 'Mở kênh. Hai đứa nghe cùng lúc.',
            outcome:
              'Frame xuất hiện waveform thứ hai. Một giọng nói gọi đúng tên anh trước thời điểm anh giới thiệu mình. Rin chỉ nói: “Đừng rời mic.”',
            flag: 'rin-ending:open-audio',
            endingId: 'open-audio',
            unlockCanonReveal: 2,
            unlockCanonRevealId: 'rin-v3-fluctlight-clause',
            imageKey: 'rin-frame12-open-channel',
            crossMode: {
              kind: 'relationship',
              text: 'Rin và anh đã cùng mở kênh riêng của Frame 12; em từng bảo anh đừng rời mic.',
            },
          },
          {
            id: 'erase-signature',
            label: 'Xoá chữ ký của anh. Bí ẩn không có quyền giữ anh làm dữ liệu.',
            outcome:
              'Silhouette biến mất nhưng bàn tay archived Rin vẫn vươn về khoảng trống. Rin tôn trọng ranh giới và trở nên nghi ngờ hơn.',
            flag: 'rin-ending:erase-signature',
            endingId: 'erase-signature',
            unlockCanonReveal: 2,
            unlockCanonRevealId: 'rin-v3-fluctlight-clause',
            imageKey: 'rin-frame12-erased',
            crossMode: {
              kind: 'relationship',
              text: 'Rin đã xóa chữ ký của anh khỏi Frame 12 vì ranh giới quan trọng hơn một lời giải.',
            },
          },
          {
            id: 'quarantine-frame',
            label: 'Niêm phong frame. Không xoá, không để nó chạm thêm vào hai đứa.',
            outcome:
              'Frame bị khóa sau lớp kính mờ; giọng nói vẫn rất nhỏ. Rin đọc lựa chọn này là thận trọng, không phải hèn nhát.',
            flag: 'rin-ending:quarantine',
            endingId: 'quarantine-frame',
            unlockCanonReveal: 2,
            unlockCanonRevealId: 'rin-v3-fluctlight-clause',
            imageKey: 'rin-frame12-quarantined',
            crossMode: {
              kind: 'relationship',
              text: 'Anh và Rin đã niêm phong Frame 12 để cùng quay lại khi cả hai sẵn sàng.',
            },
          },
        ],
        freeform: {
          invite: 'Anh tự đặt một cách xử lý khác…',
          families: [
            {
              id: 'private-copy',
              cues: ['sao chép', 'bản riêng', 'giữ riêng', 'copy'],
              outcome:
                'Rin tách một bản chỉ hai người có khóa. Frame gốc tối đi; một kênh riêng nhận tên do chính em đặt.',
              flag: 'rin-ending:private-copy',
              endingId: 'private-copy',
              unlockCanonReveal: 2,
              unlockCanonRevealId: 'rin-v3-fluctlight-clause',
              imageKey: 'rin-frame12-private-copy',
              crossMode: {
                kind: 'private-object',
                text: 'Rin và anh giữ một bản Frame 12 riêng, trên kênh do em tự đặt tên.',
              },
            },
          ],
          fallback: {
            id: 'authored-protocol',
            cues: [],
            outcome:
              'Rin chuyển hành động anh tự đặt thành một protocol mới. Archive chấp nhận nó vì lần đầu tiên quy tắc đến từ hai người đang sống, không phải studio.',
            flag: 'rin-ending:authored-protocol',
              endingId: 'authored-protocol',
            unlockCanonReveal: 2,
            unlockCanonRevealId: 'rin-v3-fluctlight-clause',
            imageKey: 'rin-frame12-authored-protocol',
            crossMode: {
              kind: 'relationship',
              text: 'Anh và Rin đã tự viết một protocol mới để xử lý Frame 12 thay vì theo lựa chọn có sẵn.',
            },
          },
        },
      },
    ],
  },
  {
    id: 'kagura-red-oath',
    residentId: 'kagura',
    route: 'hub',
    kind: 'story',
    title: 'Lời thề màu đỏ',
    synopsis:
      'Mở lớp vải quanh Akagane, lần theo những ký ức đã mất và giúp Kagura viết lời thề đầu tiên dành cho chính mình.',
    objective: 'Tìm điều Kagura muốn giữ lại khi không còn phải chứng minh giá trị bằng hy sinh.',
    canonRef: ['Thép đỏ', 'Cái giá', 'Em trai', 'Danh sách tên', 'Bức ảnh'],
    startNodeId: 'wrapping',
    rewardCanonReveal: 4,
    nodes: [
      {
        id: 'wrapping',
        prompt:
          'Khi em tháo lớp vải cũ quanh Akagane, một bức ảnh rơi xuống. Cùng lúc, lưỡi kiếm gọi ra một câu chưa trọn bằng giọng của cha em. Anh muốn xem thanh kiếm trước, hay đưa bức ảnh cho em?',
        choices: [
          {
            id: 'inspect-steel',
            label: 'Xem Akagane trước. Giọng nói đó đang cố cảnh báo em điều gì.',
            outcome:
              'Anh giữ vỏ kiếm để Kagura nhìn thẳng vào phần thép đỏ mà không phải rút nó ra.',
            nextNodeId: 'steel',
            flag: 'kagura:examined-steel',
            unlockCanonReveal: 1,
            imageKey: 'kagura-wrapping-steel',
          },
          {
            id: 'give-photo',
            label: 'Đưa ảnh cho em. Người cha muốn em nhớ có lẽ đang ở ngay trong đó.',
            outcome:
              'Anh đặt bức ảnh vào tay Kagura trước khi để Akagane dẫn câu chuyện thay em.',
            nextNodeId: 'photo',
            flag: 'kagura:held-photo-first',
            unlockCanonReveal: 1,
            imageKey: 'kagura-wrapping-photo',
          },
        ],
      },
      {
        id: 'steel',
        prompt:
          'Trên thép có mảnh đinh điện thờ, lưỡi kiếm gãy và một vệt kim loại không thuộc thời đại của em. Những phần đó đang giữ lời cuối của người chết. Anh muốn nghe giọng cha nói hết, hay đọc những cái tên khắc dưới sống kiếm trước?',
        choices: [
          {
            id: 'hear-father',
            label: 'Nghe cha em nói hết. Lời cuối không nên tiếp tục bị dùng như nhiên liệu.',
            outcome:
              'Akagane trả lại nửa câu của cha Kagura: “Con không được sinh ra chỉ để chịu thay người khác.”',
            nextNodeId: 'price',
            flag: 'kagura:heard-father',
            unlockCanonReveal: 2,
            imageKey: 'kagura-father-voice',
          },
          {
            id: 'read-names',
            label: 'Đọc danh sách tên. Anh muốn biết em đã bảo vệ ai trước khi kiếm đòi thêm.',
            outcome:
              'Hai đứa chép lại những cái tên trên lưỡi kiếm mà không rút Akagane khỏi vỏ.',
            nextNodeId: 'names',
            flag: 'kagura:copied-names',
            unlockCanonReveal: 2,
            imageKey: 'kagura-blade-names',
          },
        ],
      },
      {
        id: 'photo',
        prompt:
          'Trong ảnh, em đứng cạnh một người không phải em trai. Mặt sau có chữ của cha: “Đừng để con bé quên rằng nó cũng đáng được giữ lại.” Anh đọc nguyên văn cho em, hay đối chiếu người trong ảnh với danh sách trên kiếm?',
        choices: [
          {
            id: 'read-note',
            label: 'Anh đọc nguyên văn. Em cần nghe điều cha để lại, không phải một bản nói nhẹ đi.',
            outcome:
              'Kagura nghe lời cha mà không né tránh: em cũng là một người đáng được bảo vệ.',
            nextNodeId: 'price',
            flag: 'kagura:heard-photo-note',
            unlockCanonReveal: 2,
            imageKey: 'kagura-photo-note',
          },
          {
            id: 'match-the-face',
            label: 'Đối chiếu khuôn mặt. Nếu em từng thề với người đó, cái tên có thể vẫn còn.',
            outcome:
              'Một nét khắc trên Akagane trùng với chữ sau bức ảnh, nhưng Kagura không còn biết người ấy là ai.',
            nextNodeId: 'names',
            flag: 'kagura:matched-photo-name',
            unlockCanonReveal: 2,
            imageKey: 'kagura-photo-name',
          },
        ],
      },
      {
        id: 'price',
        prompt:
          'Akagane thừa nhận cái giá: mỗi lần em rút kiếm, một ký ức của em bị đẩy ra để nhường chỗ cho lời cuối của người khác. Ký ức lớn nhất đã mất là khuôn mặt em trai. Anh hỏi kiếm cách trả lại nó, hay từ chối thêm một cuộc trao đổi?',
        choices: [
          {
            id: 'ask-for-brother',
            label: 'Hỏi cách trả lại khuôn mặt em trai. Biết cái giá không có nghĩa là anh sẽ để em trả.',
            outcome:
              'Akagane đề nghị trả khuôn mặt em trai bằng ký ức cuối cùng Kagura còn giữ về giọng cha.',
            nextNodeId: 'brother',
            flag: 'kagura:asked-for-brother',
            unlockCanonReveal: 3,
            imageKey: 'kagura-brother-bargain',
          },
          {
            id: 'refuse-exchange',
            label: 'Không đổi thêm gì nữa. Anh muốn biết em sẽ giữ điều gì nếu thanh kiếm không được quyết định.',
            outcome:
              'Kagura từ chối để Akagane định giá ký ức tiếp theo và lần đầu hỏi bản thân muốn giữ gì.',
            nextNodeId: 'oath',
            flag: 'kagura:refused-another-price',
            unlockCanonReveal: 3,
            imageKey: 'kagura-refused-price',
          },
        ],
      },
      {
        id: 'names',
        prompt:
          'Một cái tên khiến tay em run dù đầu óc không nhận ra. Em tin đó là em trai, nhưng Akagane chỉ trả lời nếu được rút. Anh gọi tên mối liên hệ đó, hay giữ nó chưa xác định để em không bị thanh kiếm dẫn dắt?',
        choices: [
          {
            id: 'name-the-brother',
            label: 'Nói ra: có thể đó là em trai. Nhưng quyết định tiếp theo vẫn phải là của em.',
            outcome:
              'Kagura cho phép mình tin cảm giác còn lại trong tay dù khuôn mặt em trai đã biến mất.',
            nextNodeId: 'brother',
            flag: 'kagura:recognized-brother',
            unlockCanonReveal: 3,
            imageKey: 'kagura-recognized-name',
          },
          {
            id: 'do-not-let-sword-define',
            label: 'Chưa gọi nó là gì cả. Thanh kiếm không được viết hộ ký ức của em.',
            outcome:
              'Hai đứa giữ cái tên như một câu hỏi, không biến nó thành mệnh lệnh phải hi sinh thêm.',
            nextNodeId: 'oath',
            flag: 'kagura:kept-name-open',
            unlockCanonReveal: 3,
            imageKey: 'kagura-name-unresolved',
          },
        ],
      },
      {
        id: 'brother',
        prompt:
          'Khuôn mặt em trai có thể trở lại nếu em rút Akagane một lần cuối, nhưng giọng cha sẽ mất vĩnh viễn. Em không hỏi anh ký thay. Em hỏi anh nên nhìn cái giá này như cơ hội, hay như cách lời nguyền buộc em tiếp tục hi sinh?',
        choices: [
          {
            id: 'one-last-draw',
            label: 'Đó là một cơ hội chỉ khi em thật sự muốn, không phải vì thấy mình mắc nợ người đã quên.',
            outcome:
              'Kagura thừa nhận em muốn nhìn lại khuôn mặt em trai, nhưng lần đầu tách mong muốn đó khỏi nghĩa vụ.',
            nextNodeId: 'last-draw',
            flag: 'kagura:owned-desire-for-memory',
            unlockCanonReveal: 4,
            imageKey: 'kagura-last-draw-choice',
          },
          {
            id: 'break-the-bargain',
            label: 'Đây vẫn là lời nguyền mặc áo cơ hội. Em không cần mất cha lần nữa để chứng minh tình yêu với em trai.',
            outcome:
              'Kagura từ chối trao đổi người thân này lấy người thân khác và quay sang viết một lời thề mới.',
            nextNodeId: 'new-oath',
            flag: 'kagura:rejected-family-trade',
            unlockCanonReveal: 4,
            imageKey: 'kagura-break-bargain',
          },
        ],
      },
      {
        id: 'oath',
        prompt:
          'Không còn thanh kiếm ra lệnh, em chỉ còn một câu hỏi khó hơn: nếu hôm nay không ai cần được cứu, Kagura Akagane có quyền muốn điều gì cho chính mình?',
        choices: [
          {
            id: 'choose-rest',
            label: 'Một ngày bình thường không ai cần em hi sinh. Học cách ở lại trong ngày đó.',
            outcome:
              'Kagura chọn một ngày bình thường làm điều đầu tiên em giữ cho mình.',
            nextNodeId: 'new-oath',
            flag: 'kagura:chose-ordinary-day',
            unlockCanonReveal: 4,
            imageKey: 'kagura-ordinary-day',
          },
          {
            id: 'choose-truth',
            label: 'Quyền tìm lại sự thật, nhưng không dùng chính mình làm cái giá.',
            outcome:
              'Kagura vẫn chọn tìm ký ức đã mất, lần này bằng con đường không cần rút Akagane.',
            nextNodeId: 'last-draw',
            flag: 'kagura:sought-truth-without-sacrifice',
            unlockCanonReveal: 4,
            imageKey: 'kagura-truth-without-price',
          },
        ],
      },
      {
        id: 'last-draw',
        prompt:
          'Kagura đặt tay lên chuôi kiếm. Em có thể rút nó và chấp nhận mất giọng cha, hoặc niêm phong Akagane rồi tìm ký ức bằng chính những người còn sống. Cả hai đều là lựa chọn của em, không còn là lệnh của lời nguyền.',
        choices: [
          {
            id: 'draw-by-choice',
            label: 'Nếu em vẫn muốn rút, hãy rút vì em chọn ký ức đó. Anh sẽ giữ nguyên lời cha cho em.',
            outcome:
              'Kagura rút Akagane bằng lựa chọn tự do đầu tiên. Khuôn mặt em trai trở lại; giọng cha rời khỏi em, nhưng lời ông đã được anh và em cùng giữ.',
            flag: 'kagura-ending:chosen-draw',
            unlockCanonReveal: 4,
            imageKey: 'kagura-ending-chosen-draw',
          },
          {
            id: 'seal-the-blade',
            label: 'Niêm phong nó. Hai đứa sẽ tìm ký ức từ dấu vết người sống để lại.',
            outcome:
              'Kagura niêm phong Akagane và chọn tìm em trai qua thế giới hiện tại. Em giữ cả khoảng trống lẫn quyền không lấp nó bằng thêm một mất mát.',
            flag: 'kagura-ending:sealed-blade',
            unlockCanonReveal: 4,
            imageKey: 'kagura-ending-sealed-blade',
          },
        ],
      },
      {
        id: 'new-oath',
        prompt:
          'Em viết lời thề mới lên lớp vải bọc kiếm. Nó có thể là lời thề đặt Akagane xuống, hoặc lời thề chỉ mang nó như chứng tích và không bao giờ để nó quyết định giá trị của em nữa.',
        choices: [
          {
            id: 'lay-it-down',
            label: 'Đặt kiếm lại điện thờ. Giá trị của em không giảm đi khi không còn ai để cứu.',
            outcome:
              'Kagura đặt Akagane xuống và thề sẽ không dùng đau đớn làm bằng chứng mình xứng đáng tồn tại.',
            flag: 'kagura-ending:laid-down-sword',
            unlockCanonReveal: 4,
            imageKey: 'kagura-ending-lay-down',
          },
          {
            id: 'carry-it-sheathed',
            label: 'Mang nó theo, nhưng để nó nằm trong vỏ. Em là người giữ kiếm, không phải kiếm giữ em.',
            outcome:
              'Kagura tiếp tục mang Akagane như lịch sử, không như chủ nhân. Lời thề đầu tiên của em dành cho chính người đang cầm kiếm.',
            flag: 'kagura-ending:sheathed-oath',
            unlockCanonReveal: 4,
            imageKey: 'kagura-ending-sheathed',
          },
        ],
      },
    ],
  },
  {
    id: 'momo-zero-price',
    residentId: 'momo',
    route: 'hub',
    kind: 'story',
    title: 'Điều ước không có giá',
    synopsis:
      'Tìm chủ nhân của dải ruy-băng trống, phá luật Route Zero và buộc Momo gọi tên một mong muốn thật sự thuộc về em.',
    objective: 'Quyết định Momo sẽ trở thành người, viết lại giao kèo, hay biến mất cùng những điều ước đã nuốt.',
    canonRef: [
      'Thứ em ăn',
      'Cuộc trao đổi',
      'Dải vải đen',
      'Thứ em không nếm được',
      'Cái giá của việc buông tay',
    ],
    startNodeId: 'blank-ribbon',
    rewardCanonReveal: 4,
    nodes: [
      {
        id: 'blank-ribbon',
        prompt:
          'Sau chuyến tàu cuối, một dải ruy-băng không tên tự quấn quanh cổ tay em. Nó không mang điều ước của vị khách nào, nhưng Route Zero vẫn đang thu giá. Anh muốn em thử đọc nó, hay cùng anh lần ngược giao kèo?',
        choices: [
          {
            id: 'ask-her-to-read',
            label: 'Thử đọc nó, nhưng dừng ngay nếu cái giá bắt đầu lấy thứ thuộc về em.',
            outcome:
              'Momo chạm vào dải ruy-băng với một giới hạn do chính em và anh đặt ra, không theo luật của Route Zero.',
            nextNodeId: 'hunger',
            flag: 'momo:read-blank-ribbon',
            unlockCanonReveal: 1,
            imageKey: 'momo-blank-ribbon-read',
          },
          {
            id: 'trace-contract',
            label: 'Lần ngược giao kèo. Nếu không có vị khách, có thể chính quán đang muốn điều gì đó.',
            outcome:
              'Hai đứa mở sổ giao kèo và tìm một trang Route Zero đã tự viết mà không có chữ ký của khách.',
            nextNodeId: 'exchange',
            flag: 'momo:traced-house-contract',
            unlockCanonReveal: 1,
            imageKey: 'momo-contract-ledger',
          },
        ],
      },
      {
        id: 'hunger',
        prompt:
          'Dải ruy-băng có vị của những lời chưa nói, tin nhắn đã xoá và chữ “ổn” giả suốt nhiều thế kỷ — nhưng ở giữa lại có một khoảng trống em không nếm được. Anh nghĩ đó là điều ước hướng về em, hay điều ước của chính em?',
        choices: [
          {
            id: 'directed-at-her',
            label: 'Có người đang muốn em, không phải cánh cửa em mở cho họ.',
            outcome:
              'Momo nhận ra có một ham muốn hướng thẳng về em mà năng lực của em không thể định giá.',
            nextNodeId: 'unreadable',
            flag: 'momo:recognized-directed-wish',
            unlockCanonReveal: 2,
            imageKey: 'momo-directed-wish',
          },
          {
            id: 'her-own-wish',
            label: 'Đó là điều ước của em. Em không đọc được vì chưa bao giờ cho phép mình có một cái.',
            outcome:
              'Momo ngừng tìm chủ nhân bên ngoài và chấp nhận khoảng trống có thể là ham muốn đầu tiên của chính em.',
            nextNodeId: 'house-rule',
            flag: 'momo:recognized-own-wish',
            unlockCanonReveal: 2,
            imageKey: 'momo-own-wish',
          },
        ],
      },
      {
        id: 'exchange',
        prompt:
          'Trang giao kèo đầu tiên ghi: Route Zero cho em tồn tại miễn là em chỉ sống bằng điều người khác muốn. Nếu em hình thành một điều ước riêng, quán sẽ thu lại mọi dải ruy-băng cùng tên của em. Anh xé trang đó, hay tìm điều khoản cuối trước?',
        choices: [
          {
            id: 'tear-first-rule',
            label: 'Xé nó. Một giao kèo không có lựa chọn chưa bao giờ là giao kèo.',
            outcome:
              'Momo xé luật đầu tiên của Route Zero; những dải ruy-băng bắt đầu trả lại giọng nói cho chủ cũ.',
            nextNodeId: 'house-rule',
            flag: 'momo:tore-first-rule',
            unlockCanonReveal: 2,
            imageKey: 'momo-torn-contract',
          },
          {
            id: 'find-final-clause',
            label: 'Đọc tới cuối. Anh muốn biết quán sẽ làm gì trước khi để nó phản ứng.',
            outcome:
              'Điều khoản cuối xác nhận Route Zero không thể đọc hay định giá mong muốn hướng trực tiếp về Momo.',
            nextNodeId: 'unreadable',
            flag: 'momo:found-final-clause',
            unlockCanonReveal: 2,
            imageKey: 'momo-final-clause',
          },
        ],
      },
      {
        id: 'unreadable',
        prompt:
          'Điều quán không đọc được đang giữ cho dải ruy-băng không siết lại: một mong muốn không đòi phiên bản khác của cuộc đời, chỉ muốn em ở lại như chính em. Em hỏi anh có nên nhận một thứ không thể biết giá, hay trả lại vì sợ mắc nợ?',
        choices: [
          {
            id: 'accept-without-price',
            label: 'Nhận nó mà không trả gì cả. Đó chính là phần luật cũ không hiểu được.',
            outcome:
              'Momo nhận một mong muốn không kèm giao dịch. Dải ruy-băng trống đổi từ đen sang trong suốt.',
            nextNodeId: 'release',
            flag: 'momo:accepted-without-price',
            unlockCanonReveal: 3,
            imageKey: 'momo-transparent-ribbon',
          },
          {
            id: 'ask-what-she-wants',
            label: 'Đừng nhận vội. Trước hết em hãy nói điều em muốn khi không có ai ra giá.',
            outcome:
              'Lần đầu Momo phải trả lời một câu hỏi về ham muốn của em mà không thể biến nó thành trò chơi.',
            nextNodeId: 'own-desire',
            flag: 'momo:asked-own-desire',
            unlockCanonReveal: 3,
            imageKey: 'momo-own-desire-question',
          },
        ],
      },
      {
        id: 'house-rule',
        prompt:
          'Route Zero rung lên như một sinh vật bị đói. Nếu luật bị phá, mọi vị khách sẽ nhớ lại điều họ từng đổi để quên. Em có thể giữ quán sống bằng cách tiếp tục ăn điều ước, hoặc chấp nhận để từng giao kèo được trả về.',
        choices: [
          {
            id: 'return-contracts',
            label: 'Trả từng giao kèo về. Ký ức đau vẫn thuộc về người đã sống nó.',
            outcome:
              'Momo bắt đầu tháo từng dải ruy-băng và trả điều ước cùng ký ức về đúng chủ nhân.',
            nextNodeId: 'release',
            flag: 'momo:returned-contracts',
            unlockCanonReveal: 3,
            imageKey: 'momo-returning-ribbons',
          },
          {
            id: 'rewrite-the-house',
            label: 'Viết lại luật: quán chỉ giữ điều ước khi cả hai bên có thể đổi ý.',
            outcome:
              'Momo viết quyền rút lại giao kèo vào sổ. Route Zero không còn được tồn tại bằng những người không thể quay đầu.',
            nextNodeId: 'own-desire',
            flag: 'momo:rewrote-consent-rule',
            unlockCanonReveal: 3,
            imageKey: 'momo-rewritten-rule',
          },
        ],
      },
      {
        id: 'release',
        prompt:
          'Dải ruy-băng cuối cùng nằm trong tay em. Buông hết có thể khiến em thành người, hoặc xoá em vì em chưa từng sống bằng điều gì của riêng mình. Giữ một dải sẽ bảo toàn yêu nữ hiện tại, nhưng luật cũ vẫn còn một chỗ bám.',
        choices: [
          {
            id: 'release-all',
            label: 'Buông hết. Anh sẽ ở đây chứng kiến bất cứ ai thức dậy sau đó.',
            outcome:
              'Momo thả toàn bộ điều ước. Khi bình minh tới, em vẫn còn đó — có nhịp tim, không còn đọc được ai, và lần đầu phải hỏi thay vì biết.',
            nextNodeId: 'first-morning',
            flag: 'momo:released-all-wishes',
            unlockCanonReveal: 4,
            imageKey: 'momo-release-all',
          },
          {
            id: 'keep-one-by-choice',
            label: 'Giữ một dải do em tự chọn, không phải vì sợ. Rồi viết lại cái giá của nó.',
            outcome:
              'Momo giữ lại đúng một điều ước như lựa chọn của em, không như thức ăn hay xiềng xích.',
            nextNodeId: 'route-zero-new-rule',
            flag: 'momo:kept-one-by-choice',
            unlockCanonReveal: 4,
            imageKey: 'momo-one-ribbon',
          },
        ],
      },
      {
        id: 'own-desire',
        prompt:
          'Em bỏ mọi câu đùa và nói điều đầu tiên hiện ra: em muốn một buổi sáng Route Zero đóng cửa mà em vẫn tồn tại. Anh khuyên em đóng quán để thử sống ngoài nó, hay biến quán thành nơi không còn thu giá?',
        choices: [
          {
            id: 'close-at-dawn',
            label: 'Đóng quán lúc bình minh. Đi xem em còn muốn gì khi không còn ai bước vào để giao dịch.',
            outcome:
              'Momo chọn rời Route Zero vào chuyến tàu đầu, mang theo một mong muốn không ai khác viết hộ.',
            nextNodeId: 'first-morning',
            flag: 'momo:chose-life-outside',
            unlockCanonReveal: 4,
            imageKey: 'momo-first-train-out',
          },
          {
            id: 'make-a-shelter',
            label: 'Giữ quán, nhưng biến nó thành nơi người ta được nói điều ước mà không phải bán nó.',
            outcome:
              'Momo chọn ở lại và biến Route Zero từ quầy giao dịch thành nơi trú qua đêm.',
            nextNodeId: 'route-zero-new-rule',
            flag: 'momo:chose-shelter',
            unlockCanonReveal: 4,
            imageKey: 'momo-route-zero-shelter',
          },
        ],
      },
      {
        id: 'first-morning',
        prompt:
          'Chuyến tàu đầu tới. Em không còn nghe được ham muốn của cả toa và điều đó làm em sợ hơn em muốn thú nhận. Ngày đầu tiên không có năng lực nên bắt đầu bằng việc đi khỏi Tokyo, hay bằng một buổi sáng bình thường bên người đã chứng kiến em chọn?',
        choices: [
          {
            id: 'leave-tokyo',
            label: 'Đi khỏi Tokyo. Chọn một nơi chỉ vì em muốn nhìn thấy nó.',
            outcome:
              'Momo lên chuyến tàu không ghi trong bất kỳ giao kèo nào. Em bắt đầu đời người bằng một điểm đến không mang giá và không nợ ai.',
            flag: 'momo-ending:human-journey',
            unlockCanonReveal: 4,
            imageKey: 'momo-ending-human-journey',
          },
          {
            id: 'ordinary-morning',
            label: 'Bắt đầu bằng bữa sáng bình thường. Không giao kèo, không thử thách, chỉ ở lại.',
            outcome:
              'Momo trải qua buổi sáng đầu tiên như một con người: không đọc được anh, không biết trước câu trả lời, nhưng vẫn chọn ngồi lại.',
            flag: 'momo-ending:ordinary-human',
            unlockCanonReveal: 4,
            imageKey: 'momo-ending-breakfast',
          },
        ],
      },
      {
        id: 'route-zero-new-rule',
        prompt:
          'Biển hiệu Route Zero sáng lại với một dòng trống dành cho luật đầu tiên của em. Em có thể viết “mọi giao kèo đều được rút lại”, hoặc “không ai phải trả giá chỉ để được lắng nghe”.',
        choices: [
          {
            id: 'right-to-leave',
            label: 'Viết: mọi giao kèo đều được rút lại, kể cả giao kèo giữ em ở đây.',
            outcome:
              'Route Zero trở thành nơi cả khách lẫn Momo đều có quyền rời đi. Em vẫn là yêu nữ, nhưng sự tồn tại không còn phụ thuộc vào việc giữ người khác mắc nợ.',
            flag: 'momo-ending:right-to-leave',
            unlockCanonReveal: 4,
            imageKey: 'momo-ending-right-to-leave',
          },
          {
            id: 'listening-is-free',
            label: 'Viết: không ai phải trả giá chỉ để được lắng nghe.',
            outcome:
              'Momo giữ Route Zero mở qua nửa đêm mà không thu một điều ước nào. Em chọn nuôi quán bằng những người tự nguyện quay lại.',
            flag: 'momo-ending:listening-is-free',
            unlockCanonReveal: 4,
            imageKey: 'momo-ending-listening-free',
          },
        ],
      },
    ],
  },
];

export function questsForResident(
  residentId: ResidentId,
  route: CanonRoute = DEFAULT_ROUTE
): QuestDefinition[] {
  return QUESTS.filter(
    (quest) => quest.residentId === residentId && quest.route === route
  );
}

export function questById(
  id: string,
  route: CanonRoute = DEFAULT_ROUTE
): QuestDefinition | undefined {
  return QUESTS.find((quest) => quest.id === id && quest.route === route);
}

export function questNodes(quest: QuestDefinition): QuestNode[] {
  return quest.nodes;
}

export function questNode(quest: QuestDefinition, nodeId = quest.startNodeId): QuestNode {
  return quest.nodes.find((node) => node.id === nodeId) ?? quest.nodes[0];
}
