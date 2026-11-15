import type { VehicleDriver } from './vehicle-driver';

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  released?: boolean;
}

export interface MobileLifecycleOptions {
  driver: Pick<VehicleDriver, 'emergencyStop' | 'disconnect'>;
  navigatorObj?: {
    wakeLock?: {
      request(type: 'screen'): Promise<WakeLockSentinelLike>;
    };
  };
  documentObj?: {
    visibilityState: DocumentVisibilityState;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  };
  windowObj?: {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  };
}

export function attachMobileLifecycleGuards(options: MobileLifecycleOptions): () => void {
  const { driver } = options;
  const nav = options.navigatorObj ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const doc = options.documentObj ?? (typeof document !== 'undefined' ? document : undefined);
  const win = options.windowObj ?? (typeof window !== 'undefined' ? window : undefined);

  let cleanedUp = false;
  let activeSentinel: WakeLockSentinelLike | null = null;

  const acquireWakeLock = async (): Promise<void> => {
    if (cleanedUp) return;
    if (doc && doc.visibilityState !== 'visible') return;
    try {
      if (nav?.wakeLock?.request) {
        const sentinel = await nav.wakeLock.request('screen');
        if (cleanedUp) {
          void sentinel.release().catch(() => {});
        } else {
          activeSentinel = sentinel;
        }
      }
    } catch {
      // Ignore unsupported or denied wake lock requests
    }
  };

  const handleVisibilityChange = (): void => {
    if (cleanedUp) return;
    if (doc?.visibilityState === 'hidden') {
      void driver.emergencyStop();
      void driver.disconnect();
    } else if (doc?.visibilityState === 'visible') {
      void acquireWakeLock();
    }
  };

  const handlePageHide = (): void => {
    if (cleanedUp) return;
    void driver.emergencyStop();
    void driver.disconnect();
  };

  if (doc?.addEventListener) {
    doc.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (win?.addEventListener) {
    win.addEventListener('pagehide', handlePageHide);
  }

  if (!doc || doc.visibilityState === 'visible') {
    void acquireWakeLock();
  }

  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (doc?.removeEventListener) {
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (win?.removeEventListener) {
      win.removeEventListener('pagehide', handlePageHide);
    }
    if (activeSentinel) {
      void activeSentinel.release().catch(() => {});
      activeSentinel = null;
    }
  };
}
