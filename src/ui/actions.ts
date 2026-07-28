import type { Step } from '../state/store';
import type { WaifuPersona } from '../config/waifus';

/** Contract between the HTML overlay and the scene/app controller. */
export interface UIActions {
  /** Gallery: open a universe (routes to its own experience). */
  openUniverse(id: string): void;
  leaveUniverse(): void;

  // --- companion universe ---
  selectWaifu(id: string): void;
  startChat(): void;
  sendMessage(text: string): void;
  updatePersona(patch: Partial<WaifuPersona>): void;
  resetPersona(): void;
  replayGreeting(): void;
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
