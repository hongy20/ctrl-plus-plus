import { TELEMETRY_MIN_HZ, WATCHDOG_TIMEOUT_MS } from './constants';

export class WatchdogTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onTimeout: () => void,
    private readonly timeoutMs: number = WATCHDOG_TIMEOUT_MS,
  ) {}

  arm(): void {
    this.clear();
    this.timer = setTimeout(this.onTimeout, this.timeoutMs);
  }

  reset(): void {
    this.arm();
  }

  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export class AbortRegistry {
  private brakeAbort: (() => void) | null = null;
  private speedCalAbort: (() => void) | null = null;
  private stallAbort: (() => void) | null = null;

  setBrakeAbort(abort: (() => void) | null): void {
    this.brakeAbort = abort;
  }

  setSpeedCalAbort(abort: (() => void) | null): void {
    this.speedCalAbort = abort;
  }

  setStallAbort(abort: (() => void) | null): void {
    this.stallAbort = abort;
  }

  abortAll(): void {
    if (this.brakeAbort) {
      const a = this.brakeAbort;
      this.brakeAbort = null;
      a();
    }
    if (this.speedCalAbort) {
      const a = this.speedCalAbort;
      this.speedCalAbort = null;
      a();
    }
    if (this.stallAbort) {
      const a = this.stallAbort;
      this.stallAbort = null;
      a();
    }
  }
}

export class TelemetryPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(onPoll: () => void): void {
    this.stop();
    const intervalMs = Math.max(20, Math.floor(1000 / TELEMETRY_MIN_HZ));
    this.timer = setInterval(onPoll, intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
