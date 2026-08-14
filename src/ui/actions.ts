import type { SessionSetup, Step } from '../state/store';
import type { KaguraFigurineVariantId } from '../config/figurine-products';

/** Contract between the HTML overlay and the scene/app controller. */
export interface UIActions {
  /** Gallery: open a universe (routes to its own experience). */
  openUniverse(id: string): void | Promise<void>;
  leaveUniverse(): void;

  // --- companion universe ---
  finishCompanionTeaser(): void;
  enterPlayground(): void;
  selectKaguraFigurineVariant(id: KaguraFigurineVariantId): void;
  finishKaguraFigurineTransition(id: KaguraFigurineVariantId): void;
  returnToOriginalFigurine(): void;
  selectResident(id: string): void;
  sendMessage(text: string): void;
  requestOpenChatImage(turnId: string): void;
  dismissOpenChatImage(turnId: string): void;
  showOpenChatImage(turnId: string): void;
  openSessionPanel(): void;
  openWallet(): void;
  closeWallet(): void;
  redeemCredits(code: string): 'ok' | 'bad-code';
  openQuests(): void;
  closeQuests(): void;
  closeSessionPanel(): void;
  updateSession(patch: Partial<SessionSetup>): void;
  resetSession(): void;
  startQuest(id: string): void;
  chooseQuest(choiceId: string): void;
  submitQuestAction(action: string): void;
  interruptQuest(): void;
  leaveQuest(): void;
  dismissCreditError(): void;
  speakCustomText(text: string): void;
  saveChapter(memories: string[]): void;
  continueWithoutSaving(): void;
  regenerateLook(prompt: string): void;
  restoreLook(): void;

  // --- creator universe ---
  enterUniverse(): void;
  skipTransition(): void;
  /** Studio slider: select a character (camera reframes to its plinth). */
  selectCharacter(id: string): void;
  stepCharacter(delta: number): void;
  setGenText(text: string): void;
  setGenPhoto(file: File): void;
  clearGenPhoto(): void;
  /** Kick off the (simulated) regeneration of the Mate from the base + input. */
  generate(): void;
  backTo(step: Step): void;
  setMateName(name: string): void;
  join(): void;
  /** From reveal back to the studio, inputs preserved. */
  backToStudio(): void;
  restart(): void;
  /** Returns new muted state. */
  toggleMute(): boolean;
}
