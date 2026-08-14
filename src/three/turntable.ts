const DEFAULT_RADIANS_PER_PIXEL = 0.009;

/** Convert one horizontal drag into a model yaw without moving the camera. */
export function turntableYawFromDrag(
  startYaw: number,
  deltaX: number,
  radiansPerPixel = DEFAULT_RADIANS_PER_PIXEL
): number {
  return startYaw + deltaX * radiansPerPixel;
}

interface TurntableControllerOptions {
  enabled(): boolean;
  yaw(): number;
  onYaw(yaw: number): void;
  onDragChange?(dragging: boolean): void;
}

/** Pointer owner for the companion turntable. OrbitControls stays disabled. */
export class TurntableController {
  private pointerId: number | null = null;
  private startX = 0;
  private startYaw = 0;

  constructor(
    private readonly dom: HTMLElement,
    private readonly options: TurntableControllerOptions
  ) {
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerEnd);
    dom.addEventListener('pointercancel', this.onPointerEnd);
    dom.addEventListener('lostpointercapture', this.onPointerEnd);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.options.enabled() || event.button !== 0 || !event.isPrimary) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startYaw = this.options.yaw();
    this.dom.setPointerCapture(event.pointerId);
    this.options.onDragChange?.(true);
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.options.onYaw(turntableYawFromDrag(this.startYaw, event.clientX - this.startX));
    event.preventDefault();
  };

  private onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.finish(event.pointerId);
  };

  private finish(pointerId: number): void {
    if (this.dom.hasPointerCapture(pointerId)) this.dom.releasePointerCapture(pointerId);
    this.pointerId = null;
    this.options.onDragChange?.(false);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerEnd);
    this.dom.removeEventListener('pointercancel', this.onPointerEnd);
    this.dom.removeEventListener('lostpointercapture', this.onPointerEnd);
  }
}
