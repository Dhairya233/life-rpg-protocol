// lib/focus-monitor.ts

export type PenaltyCallback = (duration: number) => void;
export type ViolationCallback = (count: number, active: boolean) => void;

export class FocusMonitor {
  private isViolated: boolean = false;
  private violationCount: number = 0;
  private violationTimer: ReturnType<typeof setTimeout> | null = null;
  private onPenalty: PenaltyCallback;
  private onViolationChange: ViolationCallback;
  
  // 10-second grace period in production, 2 seconds in dev for testing
  private readonly GRACE_MS = process.env.NODE_ENV === 'development' ? 2000 : 10000;

  constructor(onPenalty: PenaltyCallback, onViolationChange: ViolationCallback) {
    this.onPenalty = onPenalty;
    this.onViolationChange = onViolationChange;
  }

  public start() {
    if (typeof window === 'undefined') return;

    // Layer 1: Page Visibility API
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Layer 2: Window Focus/Blur
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('focus', this.handleFocus);

    // Layer 3: Mouse Leave (cursor leaves HTML document)
    document.documentElement.addEventListener('mouseleave', this.handleMouseLeave);
    document.documentElement.addEventListener('mouseenter', this.handleMouseEnter);
  }

  public stop() {
    if (typeof window === 'undefined') return;

    this.clearTimer();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('focus', this.handleFocus);
    document.documentElement.removeEventListener('mouseleave', this.handleMouseLeave);
    document.documentElement.removeEventListener('mouseenter', this.handleMouseEnter);
  }

  private triggerViolation = () => {
    if (this.isViolated) return;
    this.isViolated = true;
    this.violationCount++;
    this.onViolationChange(this.violationCount, true);

    this.violationTimer = setTimeout(() => {
      // Grace period expired, trigger penalty
      this.onPenalty(this.GRACE_MS);
    }, this.GRACE_MS);
  };

  private resolveViolation = () => {
    if (!this.isViolated) return;
    this.isViolated = false;
    this.clearTimer();
    this.onViolationChange(this.violationCount, false);
  };

  private clearTimer() {
    if (this.violationTimer) {
      clearTimeout(this.violationTimer);
      this.violationTimer = null;
    }
  }

  // Event Handlers
  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.triggerViolation();
    } else {
      this.resolveViolation();
    }
  };

  private handleBlur = () => {
    this.triggerViolation();
  };

  private handleFocus = () => {
    this.resolveViolation();
  };

  private handleMouseLeave = (e: MouseEvent) => {
    // Only trigger if mouse actually leaves the viewport bounds
    if (e.clientY <= 0 || e.clientX <= 0 || (e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
      this.triggerViolation();
    }
  };

  private handleMouseEnter = () => {
    this.resolveViolation();
  };
}
