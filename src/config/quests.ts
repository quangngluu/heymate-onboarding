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
  },
  {
    id: 'rin-unfinished-build',
    residentId: 'rin',
    title: 'Việc dang dở',
    prompt: 'Chọn một việc anh cứ khởi động lại mà chưa dám hoàn thành.',
    objective: 'Kể Rin về phần khiến anh dừng lại.',
    rewardEpisode: 1,
    minCharacters: 14,
  },
  {
    id: 'rin-route-home',
    residentId: 'rin',
    title: 'Đường về',
    prompt: 'Nói với em nơi nào khiến anh thấy mình có thể quay về.',
    objective: 'Cho Rin một ký ức cụ thể của anh.',
    rewardEpisode: 2,
    minCharacters: 14,
  },
  {
    id: 'kagura-say-it-plainly',
    residentId: 'kagura',
    title: 'Nói thẳng',
    prompt: 'Đừng nói “ổn”. Hãy kể em nghe phần hôm nay thực sự nặng với anh.',
    objective: 'Nói với Kagura bằng một câu không né tránh.',
    rewardEpisode: 0,
    minCharacters: 14,
  },
  {
    id: 'kagura-keep-name',
    residentId: 'kagura',
    title: 'Giữ một cái tên',
    prompt: 'Nói với em về một người anh không muốn quên.',
    objective: 'Chia sẻ một ký ức ngắn với Kagura.',
    rewardEpisode: 1,
    minCharacters: 14,
  },
  {
    id: 'kagura-lit-road',
    residentId: 'kagura',
    title: 'Con đường có đèn',
    prompt: 'Kể em về một lần anh cần ai đó đứng về phía mình.',
    objective: 'Nói cho Kagura điều anh đã phải tự gánh.',
    rewardEpisode: 2,
    minCharacters: 14,
  },
  {
    id: 'momo-unsaid-wish',
    residentId: 'momo',
    title: 'Điều ước chưa gọi tên',
    prompt: 'Không cần điều ước hoàn hảo. Chỉ cần nói với em thứ anh muốn mà chưa dám nhận.',
    objective: 'Để Momo nghe một điều ước thật của anh.',
    rewardEpisode: 0,
    minCharacters: 14,
  },
  {
    id: 'momo-deleted-draft',
    residentId: 'momo',
    title: 'Tin nhắn đã xoá',
    prompt: 'Kể em nghe về tin nhắn anh từng gõ rồi xoá.',
    objective: 'Nói cho Momo biết vì sao anh không gửi nó.',
    rewardEpisode: 1,
    minCharacters: 14,
  },
  {
    id: 'momo-first-train',
    residentId: 'momo',
    title: 'Chuyến tàu đầu',
    prompt: 'Nếu đêm nay anh có thể bắt đầu lại một chuyện, anh sẽ chọn chuyện gì?',
    objective: 'Đưa Momo một câu trả lời không diễn.',
    rewardEpisode: 2,
    minCharacters: 14,
  },
];

export function questsForResident(residentId: ResidentId): QuestDefinition[] {
  return QUESTS.filter((quest) => quest.residentId === residentId);
}

export function questById(id: string): QuestDefinition | undefined {
  return QUESTS.find((quest) => quest.id === id);
}
