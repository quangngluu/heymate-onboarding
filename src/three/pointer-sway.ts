/**
 * Turns one damped pointer target into a normalized (-1..1) sway pair, published
 * only when the rounded value changes. The pointer handler records intent
 * (clientX/clientY against a cached viewport) and never reads layout; the frame
 * loop owns the frame-rate-independent easing toward that target.
 *
 * Disabled entirely when the visitor prefers reduced motion or lacks a fine
 * hover-capable pointer, and gated at runtime through `active()` — the app
 * passes `() => !deskStageActive` so the desk plate match never sways.
 */

/** Frame-rate-independent easing factor: 0.055 per 60 Hz frame. */
export function swayAlpha(dt: number): number {
  return 1 - Math.pow(1 - 0.055, dt * 60);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface PointerSwayOptions {
  reducedMotion: boolean;
  /** When this returns false, sway is published back to (0,0) and ignored. */
  active?: () => boolean;
}

export class PointerSway {
  private readonly publish: (x: number, y: number) => void;
  private readonly active: (() => boolean) | undefined;
  private readonly disabled: boolean;

  private targetX = 0;
  private targetY = 0;
  private smoothX = 0;
  private smoothY = 0;
  private lastX = 0;
  private lastY = 0;
  private viewportW = 1;
  private viewportH = 1;
  private settledCenter = false;

  constructor(publish: (x: number, y: number) => void, opts: PointerSwayOptions) {
    this.publish = publish;
    this.active = opts.active;
    // Reduced motion, or a coarse/touch-only pointer, keeps the authored center
    // pose: passive sway must never require dragging to reveal content.
    const finePointer =
      window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    this.disabled = opts.reducedMotion || !finePointer;
    if (this.disabled) return;

    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
    window.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('resize', this.onResize);
  }

  update(dt: number): void {
    if (this.disabled) return;
    const alpha = swayAlpha(dt);
    this.smoothX += (this.targetX - this.smoothX) * alpha;
    this.smoothY += (this.targetY - this.smoothY) * alpha;
    const x = round3(this.smoothX);
    const y = round3(this.smoothY);
    if (x !== this.lastX || y !== this.lastY) {
      this.lastX = x;
      this.lastY = y;
      this.publish(x, y);
    }
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    if (this.active && !this.active()) {
      this.resetToCenter();
      return;
    }
    this.settledCenter = false;
    this.targetX = (e.clientX / Math.max(1, this.viewportW)) * 2 - 1;
    this.targetY = (e.clientY / Math.max(1, this.viewportH)) * 2 - 1;
  };

  private readonly onPointerLeave = (): void => {
    this.targetX = 0;
    this.targetY = 0;
  };

  private readonly onResize = (): void => {
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
  };

  private resetToCenter(): void {
    if (this.settledCenter) return;
    this.settledCenter = true;
    this.targetX = 0;
    this.targetY = 0;
    this.smoothX = 0;
    this.smoothY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.publish(0, 0);
  }
}
