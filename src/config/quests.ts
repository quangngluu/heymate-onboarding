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
];

export function questsForResident(residentId: ResidentId): QuestDefinition[] {
  return QUESTS.filter((quest) => quest.residentId === residentId);
}

export function questById(id: string): QuestDefinition | undefined {
  return QUESTS.find((quest) => quest.id === id);
}
