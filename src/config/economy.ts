export const START_CREDITS = 100;
export const TOPUP_CODE = 'MATEWAIFU';
export const TOPUP_AMOUNT = 50;
export const STORY_QUEST_REWARD = 25;

export const COST = {
  turn: 2,
  speakForMe: 6,
  saveChapter: 12,
  turntable: 30,
  sceneImage: 4,
} as const;

export type Spend = keyof typeof COST;
export type CreditFeature = Spend | 'redeem' | 'storyQuest' | 'onboardingQuest';

export const CREDIT_LABEL: Record<CreditFeature, string> = {
  turn: 'Tin nhắn',
  speakForMe: 'Để em nói hộ',
  saveChapter: 'Lưu chương',
  turntable: 'Bàn xoay',
  sceneImage: 'Ảnh bối cảnh',
  redeem: 'Nạp mã',
  storyQuest: 'Quest cốt truyện',
  onboardingQuest: 'Quest tân thủ',
};

export const CREDIT_CATALOG: { feature: Spend; label: string; price: number }[] = [
  { feature: 'turn', label: CREDIT_LABEL.turn, price: COST.turn },
  { feature: 'speakForMe', label: CREDIT_LABEL.speakForMe, price: COST.speakForMe },
  { feature: 'saveChapter', label: CREDIT_LABEL.saveChapter, price: COST.saveChapter },
  { feature: 'sceneImage', label: CREDIT_LABEL.sceneImage, price: COST.sceneImage },
];
