import type { ResidentId } from './residents';

/** A reflective conversation task that unlocks one consecutive story beat. */
export interface QuestDefinition {
  id: string;
  residentId: ResidentId;
  title: string;
  prompt: string;
  objective: string;
  rewardEpisode: number;
  minCharacters: number;
  /**
   * Three answers a visitor could honestly give. They exist so the quest is a
   * scene with choices rather than a blank box that demands a confession.
   * Free typing always stays open beside them.
   */
  options: [string, string, string];
}

export const QUESTS: QuestDefinition[] = [
  {
    id: 'rin-unsent-message',
    residentId: 'rin',
    title: 'Tín hiệu chưa gửi',
    prompt: 'Kể em nghe về một điều anh đã định nói rồi lại thôi.',
    objective: 'Viết cho Rin một câu trả lời thật lòng.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Anh từng định xin lỗi một người, rồi để đó luôn.',
      'Có một câu anh muốn nói với sếp, cuối cùng chỉ gật đầu.',
      'Anh định nhắn cho người cũ, gõ xong rồi xoá.',
    ],
  },
  {
    id: 'rin-unfinished-build',
    residentId: 'rin',
    title: 'Việc dang dở',
    prompt: 'Chọn một việc anh cứ khởi động lại mà chưa dám hoàn thành.',
    objective: 'Kể Rin về phần khiến anh dừng lại.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Dự án riêng của anh, làm được một nửa là dừng.',
      'Anh học lại tiếng Nhật lần thứ ba, vẫn chưa qua bài mười.',
      'Anh cứ định đi khám sức khoẻ mà lần nào cũng hoãn.',
    ],
  },
  {
    id: 'rin-route-home',
    residentId: 'rin',
    title: 'Đường về',
    prompt: 'Nói với em nơi nào khiến anh thấy mình có thể quay về.',
    objective: 'Cho Rin một ký ức cụ thể của anh.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Quán cà phê gần nhà cũ, chỗ đó chưa đổi gì.',
      'Phòng của anh lúc hai giờ sáng, không ai gọi.',
      'Nhà bà ngoại, dù bà không còn ở đó nữa.',
    ],
  },
  {
    id: 'kagura-say-it-plainly',
    residentId: 'kagura',
    title: 'Nói thẳng',
    prompt: 'Đừng nói “ổn”. Hãy kể em nghe phần hôm nay thực sự nặng với anh.',
    objective: 'Nói với Kagura bằng một câu không né tránh.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Hôm nay anh mệt vì phải giả vờ ổn cả ngày.',
      'Anh bị nói một câu từ sáng, tới giờ vẫn chưa gỡ được.',
      'Anh làm hỏng một việc và chưa dám nói với ai.',
    ],
  },
  {
    id: 'kagura-keep-name',
    residentId: 'kagura',
    title: 'Giữ một cái tên',
    prompt: 'Nói với em về một người anh không muốn quên.',
    objective: 'Chia sẻ một ký ức ngắn với Kagura.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Ông nội anh, người duy nhất không bắt anh giải thích.',
      'Một người bạn cũ, giờ hai đứa không còn nhắn nữa.',
      'Người đã tin anh trước cả khi anh tin chính mình.',
    ],
  },
  {
    id: 'kagura-lit-road',
    residentId: 'kagura',
    title: 'Con đường có đèn',
    prompt: 'Kể em về một lần anh cần ai đó đứng về phía mình.',
    objective: 'Nói cho Kagura điều anh đã phải tự gánh.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Lần anh bị đổ lỗi trong cuộc họp, không ai lên tiếng.',
      'Hồi anh bỏ việc, cả nhà đều nói anh sai.',
      'Lúc anh nằm viện một mình và không gọi cho ai.',
    ],
  },
  {
    id: 'momo-unsaid-wish',
    residentId: 'momo',
    title: 'Điều ước chưa gọi tên',
    prompt: 'Không cần điều ước hoàn hảo. Chỉ cần nói với em thứ anh muốn mà chưa dám nhận.',
    objective: 'Để Momo nghe một điều ước thật của anh.',
    rewardEpisode: 0,
    minCharacters: 14,
    options: [
      'Anh muốn nghỉ một tháng mà không thấy có lỗi.',
      'Anh muốn ai đó hỏi anh có ổn không, rồi chờ nghe thật.',
      'Anh muốn làm lại từ đầu ở một thành phố khác.',
    ],
  },
  {
    id: 'momo-deleted-draft',
    residentId: 'momo',
    title: 'Tin nhắn đã xoá',
    prompt: 'Kể em nghe về tin nhắn anh từng gõ rồi xoá.',
    objective: 'Nói cho Momo biết vì sao anh không gửi nó.',
    rewardEpisode: 1,
    minCharacters: 14,
    options: [
      'Anh gõ nhớ em rồi xoá, ba lần trong một đêm.',
      'Anh định hỏi vì sao người ta đi mà không nói gì.',
      'Anh viết một tin xin việc rồi tự thấy mình chưa đủ.',
    ],
  },
  {
    id: 'momo-first-train',
    residentId: 'momo',
    title: 'Chuyến tàu đầu',
    prompt: 'Nếu đêm nay anh có thể bắt đầu lại một chuyện, anh sẽ chọn chuyện gì?',
    objective: 'Đưa Momo một câu trả lời không diễn.',
    rewardEpisode: 2,
    minCharacters: 14,
    options: [
      'Anh sẽ nói chuyện lại với người anh đã cắt liên lạc.',
      'Anh sẽ bắt đầu lại cái nghề anh bỏ giữa chừng.',
      'Anh sẽ về nhà sớm hơn, một buổi tối nào đó.',
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
