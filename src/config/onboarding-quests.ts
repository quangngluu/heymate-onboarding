export type OnboardingTrigger =
  | 'first-message'
  | 'set-chat-config'
  | 'try-speak-for-me'
  | 'save-chapter';

export interface OnboardingQuest {
  id: string;
  title: string;
  description: string;
  trigger: OnboardingTrigger;
  rewardCredits: number;
}

export const ONBOARDING_QUESTS: OnboardingQuest[] = [
  {
    id: 'hello-first',
    title: 'Mở lời',
    description: 'Gửi cho em câu đầu tiên của anh.',
    trigger: 'first-message',
    rewardCredits: 5,
  },
  {
    id: 'shape-the-session',
    title: 'Chọn cách em ở cạnh anh',
    description: 'Đổi bối cảnh, không khí hoặc cách em dẫn chuyện.',
    trigger: 'set-chat-config',
    rewardCredits: 5,
  },
  {
    id: 'lend-her-words',
    title: 'Để em nói hộ',
    description: 'Viết một câu và nghe em nói bằng giọng của mình.',
    trigger: 'try-speak-for-me',
    rewardCredits: 5,
  },
  {
    id: 'keep-the-chapter',
    title: 'Giữ lại một chương',
    description: 'Lưu điều em nên nhớ cho lần gặp sau.',
    trigger: 'save-chapter',
    rewardCredits: 10,
  },
];

export function onboardingQuestFor(trigger: OnboardingTrigger): OnboardingQuest | undefined {
  return ONBOARDING_QUESTS.find((quest) => quest.trigger === trigger);
}
