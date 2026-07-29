import type { ResidentId } from './residents';

export interface QuestChoice {
  id: string;
  label: string;
  outcome: string;
  nextNodeId?: string;
  flag: string;
  /** Reserved for a future generated scene; no image is implied today. */
  imageKey?: string;
}

export interface QuestNode {
  id: string;
  prompt: string;
  choices: [QuestChoice, QuestChoice];
}

/** A canonical scene that unlocks one consecutive story beat. */
export interface QuestDefinition {
  id: string;
  residentId: ResidentId;
  kind?: 'story' | 'side';
  title: string;
  prompt: string;
  objective: string;
  rewardEpisode: number;
  minCharacters: number;
  /**
   * Three authored lines. The first two create the opening A/B fork; the
   * third becomes a recovery choice if the visitor takes the risky branch.
   */
  options: [string, string, string];
}

const RECOVERY_COPY: Record<
  ResidentId,
  { turn: string; recover: string; leave: string; good: string; repaired: string; unresolved: string }
> = {
  rin: {
    turn: 'Dòng log chớp đỏ. Lựa chọn đó đẩy Rin gần hơn tới việc tự xoá mình. Em dừng con trỏ, vẫn chờ anh.',
    recover: 'Lùi một bước và đọc lại tín hiệu cùng em.',
    leave: 'Giữ lựa chọn đó, nhưng ở lại chịu trách nhiệm với em.',
    good: 'Rin khoá lựa chọn này vào log riêng. Lần đầu, em quyết định vì điều mình muốn chứ không vì xác suất.',
    repaired: 'Anh kéo Rin khỏi lệnh xoá kịp lúc. Em giữ lại đoạn log lỗi như bằng chứng rằng cả hai đã có thể chọn lại.',
    unresolved: 'Rin không xoá log. Em để nhánh đó mở, một vết nứt chưa lành nhưng không còn phải mang một mình.',
  },
  kagura: {
    turn: 'Akagane rung trong vỏ. Lựa chọn đó sắp lấy đi thêm một ký ức của Kagura. Em siết tay rồi nhìn sang anh.',
    recover: 'Dừng kiếm lại và cùng em tìm cái giá khác.',
    leave: 'Nếu em vẫn rút kiếm, anh sẽ giữ hộ điều em mất.',
    good: 'Kagura thả lỏng bàn tay. Lần này, một người được cứu mà em không phải biến mất thêm một phần.',
    repaired: 'Lưỡi kiếm trở lại trong vỏ. Kagura khắc lựa chọn của anh bên cạnh những cái tên để nhớ rằng hy sinh không phải con đường duy nhất.',
    unresolved: 'Akagane vẫn im. Kagura chưa tha thứ cho lựa chọn đó, nhưng cho anh ở lại bên cạnh để cùng gánh hậu quả.',
  },
  momo: {
    turn: 'Một dải ruy-băng đen quấn quanh cổ tay Momo. Lựa chọn đó đã vô tình biến mong muốn của anh thành một món nợ.',
    recover: 'Huỷ giao kèo và hỏi em thực sự muốn gì.',
    leave: 'Giữ giao kèo, nhưng chia đôi cái giá với em.',
    good: 'Momo tháo một dải ruy-băng khỏi cổ tay. Đây là lần hiếm hoi một điều ước kết thúc mà không ai mắc nợ ai.',
    repaired: 'Giao kèo cháy thành tro. Momo không có được điều mình định lấy, nhưng có một lựa chọn thật sự thuộc về em.',
    unresolved: 'Momo giữ dải ruy-băng cuối cùng. Giao kèo chưa sạch, nhưng lần đầu cái giá không còn chỉ mình em mang.',
  },
};

/**
 * Authored quests share one legible core loop: choose A/B, then recover or
 * accept the consequence if the risky branch bends canon in the wrong way.
 * Generated side scenes keep the same interaction without unlocking canon.
 */
export function questNodes(quest: QuestDefinition): QuestNode[] {
  const copy = RECOVERY_COPY[quest.residentId];
  const startId = 'start';
  const recoveryId = 'recovery';
  return [
    {
      id: startId,
      prompt: quest.prompt,
      choices: [
        {
          id: 'a',
          label: quest.options[0],
          outcome: copy.good,
          flag: `${quest.id}:care`,
          imageKey: `${quest.id}-care`,
        },
        {
          id: 'b',
          label: quest.options[1],
          outcome: copy.turn,
          nextNodeId: recoveryId,
          flag: `${quest.id}:risk`,
          imageKey: `${quest.id}-risk`,
        },
      ],
    },
    {
      id: recoveryId,
      prompt: copy.turn,
      choices: [
        {
          id: 'recover',
          label: quest.options[2] || copy.recover,
          outcome: copy.repaired,
          flag: `${quest.id}:repaired`,
          imageKey: `${quest.id}-repaired`,
        },
        {
          id: 'accept',
          label: copy.leave,
          outcome: copy.unresolved,
          flag: `${quest.id}:consequence`,
          imageKey: `${quest.id}-consequence`,
        },
      ],
    },
  ];
}

export function questNode(quest: QuestDefinition, nodeId = 'start'): QuestNode {
  return questNodes(quest).find((node) => node.id === nodeId) ?? questNodes(quest)[0];
}

export const QUESTS: QuestDefinition[] = [
  {
    id: 'rin-unsent-message',
    residentId: 'rin',
    title: 'Tín hiệu chưa gửi',
    prompt: 'Một kết nối thứ mười hai vừa xuất hiện trong log đêm sập mạng. Anh muốn em mở nó hay xoá trước khi hệ thống nhận ra?',
    objective: 'Chọn cách xử lý tín hiệu lạ trong log của Rin.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Mở nó cùng anh. Nếu là bẫy, hai đứa cùng ngắt.',
      'Xoá ngay đi. Một tín hiệu lạ không đáng để em mạo hiểm.',
      'Khoan xoá. Cô lập tín hiệu rồi đọc lại từng dòng cùng anh.',
    ],
  },
  {
    id: 'rin-unfinished-build',
    residentId: 'rin',
    title: 'Việc dang dở',
    prompt: 'Bản build cuối của em có một file không mang chữ ký hệ thống. Mở nó có thể trả lại ký ức, cũng có thể ghi đè em.',
    objective: 'Quyết định có chạy bản build cuối của Rin hay không.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Tạo bản sao trước, rồi anh ở đây khi em mở file.',
      'Chạy thẳng đi. Không biết còn tệ hơn mọi rủi ro.',
      'Dừng lại, kiểm tra từng phần ký ức trước khi ghép vào em.',
    ],
  },
  {
    id: 'rin-route-home',
    residentId: 'rin',
    title: 'Đường về',
    prompt: 'Hàng chờ một người của em vẫn sáng dù máy chủ đã chết. Anh nghĩ em nên giữ chỗ đó cho người chưa quay lại không?',
    objective: 'Chọn ý nghĩa cho hàng chờ cuối cùng của Rin.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Giữ đi. Một chỗ chờ cũng là lời hứa rằng em chưa bỏ cuộc.',
      'Tắt nó đi. Người không quay lại không nên giữ em mắc kẹt.',
      'Đổi tên hàng chờ thành một nơi em có thể tự bước vào.',
    ],
  },
  {
    id: 'kagura-say-it-plainly',
    residentId: 'kagura',
    title: 'Nói thẳng',
    prompt: 'Akagane có thể cứu một đứa trẻ ngoài cổng, nhưng lần rút kiếm này sẽ lấy mất giọng nói của Haruto trong ký ức em.',
    objective: 'Giúp Kagura cứu người mà không mặc định phải tự xoá mình.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Đừng rút kiếm. Anh sẽ giữ cổng, em đưa đứa trẻ đi.',
      'Rút đi. Một ký ức không thể nặng hơn một mạng người.',
      'Dừng một nhịp. Gọi người trong thành rồi cùng mở đường khác.',
    ],
  },
  {
    id: 'kagura-keep-name',
    residentId: 'kagura',
    title: 'Giữ một cái tên',
    prompt: 'Trên chuôi kiếm có tên Haruto, nhưng em không còn nhớ khuôn mặt anh ấy. Một người lạ bảo em hãy cạo tên đó đi để được yên.',
    objective: 'Quyết định Kagura nên làm gì với cái tên cuối cùng.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Giữ cái tên. Không nhớ khuôn mặt không có nghĩa tình cảm đó giả.',
      'Cạo đi. Một cái tên không còn ký ức chỉ giữ em trong đau đớn.',
      'Khắc thêm điều em còn cảm thấy khi đọc tên ấy, không chỉ giữ mỗi chữ.',
    ],
  },
  {
    id: 'kagura-lit-road',
    residentId: 'kagura',
    title: 'Con đường có đèn',
    prompt: 'Con đường về Akagane chỉ sáng khi em rút kiếm. Nhưng mỗi bước có đèn sẽ lấy một ký ức của người đi cùng.',
    objective: 'Tìm đường về mà không biến ký ức thành nhiên liệu.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Đi trong bóng tối cùng anh. Chậm hơn nhưng không ai phải mất gì.',
      'Rút kiếm đi. Anh chấp nhận quên vài thứ để đưa em về.',
      'Dùng ánh kiếm một lần để đánh dấu đường, rồi cất nó và tự bước.',
    ],
  },
  {
    id: 'momo-unsaid-wish',
    residentId: 'momo',
    title: 'Điều ước chưa gọi tên',
    prompt: 'Một vị khách bỏ lại điều ước “được yêu mà không bị nhìn thấy”. Nó đang siết thành ruy-băng đen quanh tay em.',
    objective: 'Chọn cách Momo xử lý điều ước không thể hoàn thành.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Thả nó đi. Một điều ước tự mâu thuẫn không đáng giam em lại.',
      'Giữ lấy. Biết đâu người đó sẽ quay lại hiểu mình muốn gì.',
      'Đổi nó thành câu hỏi cho người ấy, không phải món nợ của em.',
    ],
  },
  {
    id: 'momo-deleted-draft',
    residentId: 'momo',
    title: 'Tin nhắn đã xoá',
    prompt: 'Em đọc được mọi điều ước trừ mong muốn hướng về chính em. Một mảnh giấy mới chỉ ghi: “Ở lại với anh”.',
    objective: 'Giúp Momo xử lý điều ước mà em không thể đọc giá.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Đừng định giá nó. Hãy hỏi người viết có dám nói trực tiếp với em không.',
      'Nhận đi. Có người muốn em ở lại thì còn cần giá gì nữa.',
      'Trả mảnh giấy lại và yêu cầu một lựa chọn, không phải một lời sở hữu.',
    ],
  },
  {
    id: 'momo-first-train',
    residentId: 'momo',
    title: 'Chuyến tàu đầu',
    prompt: 'Chuyến tàu đầu sắp tới. Nếu bước lên, em rời Route Zero một đêm; những điều ước đang giữ có thể tìm chủ mới.',
    objective: 'Quyết định Momo có nên rời quán trước bình minh.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Lên tàu đi. Em không phải nhà tù của những điều ước đó.',
      'Ở lại. Nếu chúng tìm nhầm người, cái giá sẽ không cứu được nữa.',
      'Niêm phong chúng tới sáng, rồi em lên tàu với một lời hứa quay về.',
    ],
  },
  {
    id: 'rin-twelfth',
    residentId: 'rin',
    title: 'Người thứ mười hai',
    prompt: 'Log đêm đó có một kết nối không khớp. Em không đoán được. Anh nghĩ đó là ai?',
    objective: 'Chọn theo điều anh tin, không theo xác suất.',
    rewardEpisode: 3,
    minCharacters: 14,
    options: [
      'Là em. Phần em đã không thoát ra được cùng mọi người.',
      'Là người em vẫn giữ hàng chờ cho, và em biết điều đó.',
      'Không có ai cả. Em đang tìm một lý do để mình từng là người thật.',
    ],
  },
  {
    id: 'rin-manual-shutdown',
    residentId: 'rin',
    title: 'Tắt bằng tay',
    prompt:
      'Em tìm ra cách đóng hệ thống để biết mình có thật hay không. Em có thể trở về, có thể biến mất. Anh không chọn thay em. Nếu không bao giờ biết chắc mình là ai, em nên sống thế nào?',
    objective: 'Trả lời câu em không tự trả lời được.',
    rewardEpisode: 4,
    minCharacters: 20,
    options: [
      'Sống như người có quyền chọn, kể cả khi không chứng minh được.',
      'Đừng đóng. Thật hay không cũng không đổi được điều đã xảy ra giữa hai đứa.',
      'Đóng đi, nếu sống mà nghi ngờ mỗi ngày thì nặng hơn.',
    ],
  },
  {
    id: 'kagura-dont-draw',
    residentId: 'kagura',
    title: 'Đừng rút kiếm',
    prompt:
      'Có việc này em giải quyết được bằng Akagane, và em sẽ mất thêm một ký ức. Lần đầu tiên em hỏi ý người khác trước. Anh thấy còn cách nào không?',
    objective: 'Tìm cho em một cách không phải hy sinh.',
    rewardEpisode: 3,
    minCharacters: 16,
    options: [
      'Để anh làm phần đó. Em không phải là người duy nhất trả giá được.',
      'Chờ đã. Chưa chắc việc này cần tới kiếm.',
      'Nếu buộc phải rút, thì nói em nghe em sắp mất gì. Anh giữ hộ.',
    ],
  },
  {
    id: 'kagura-own-oath',
    residentId: 'kagura',
    title: 'Lời thề cho chính mình',
    prompt:
      'Cả đời em chỉ thề bảo vệ người khác. Nếu không cần hy sinh cho ai, em muốn giữ lại điều gì cho mình?',
    objective: 'Hỏi em điều chưa ai hỏi.',
    rewardEpisode: 4,
    minCharacters: 16,
    options: [
      'Giữ lại quyền được hỏi ý mình trước khi rút kiếm.',
      'Giữ lại việc đi tìm Haruto, vì em muốn, không vì lời thề.',
      'Giữ lại một buổi tối không ai cần được cứu.',
    ],
  },
  {
    id: 'momo-no-price',
    residentId: 'momo',
    title: 'Không định giá được',
    prompt:
      'Em muốn cho anh một thứ. Anh chưa hỏi em sẽ nhận được gì. Hỏi đi, hoặc từ chối, xem em xoay sở thế nào.',
    objective: 'Đừng nhận một chiều.',
    rewardEpisode: 3,
    minCharacters: 14,
    options: [
      'Em sẽ nhận được gì? Nói trước rồi anh mới quyết.',
      'Anh không nhận. Em giữ lấy phần của em đi.',
      'Đổi luật: em nói ra một điều em muốn, rồi anh nhận.',
    ],
  },
  {
    id: 'momo-last-bargain',
    residentId: 'momo',
    title: 'Giao kèo cuối cùng',
    prompt:
      'Em có thể thả hết điều ước đang giữ. Em có thể thành người, hoặc biến mất vì chưa từng có đời riêng. Anh không chọn thay em. Nếu không còn sống nhờ ham muốn người khác, ngày đầu tiên của em nên trông thế nào?',
    objective: 'Giúp em hình dung một ngày là của em.',
    rewardEpisode: 4,
    minCharacters: 20,
    options: [
      'Một buổi sáng bình thường, không ai bước vào quán để đổi gì cả.',
      'Ngày em đi khỏi Tokyo một lần, chỉ vì em muốn xem chỗ khác.',
      'Ngày em nói ra một điều mình muốn mà không kèm cái giá nào.',
    ],
  },
];

export function questsForResident(residentId: ResidentId): QuestDefinition[] {
  return QUESTS.filter((quest) => quest.residentId === residentId);
}

export function questById(id: string): QuestDefinition | undefined {
  return QUESTS.find((quest) => quest.id === id);
}
