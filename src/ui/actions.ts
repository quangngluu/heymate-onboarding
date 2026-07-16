import type { Step } from '../state/store';

/** Contract between the HTML overlay and the scene/app controller. */
export interface UIActions {
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
