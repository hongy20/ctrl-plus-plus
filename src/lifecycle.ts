import type { VehicleDriver } from './vehicle-driver';

export interface MobileLifecycleTargets {
  driver: VehicleDriver;
  navigatorObj?: {
    wakeLock?: {
      request(type: 'screen'): Promise<{ released: boolean; release(): Promise<void> }>;
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

export function attachMobileLifecycleGuards(options: MobileLifecycleTargets): () => void {
  const { driver } = options;
  const nav =
    options.navigatorObj ??
    (typeof navigator !== 'undefined'
      ? (navigator as MobileLifecycleTargets['navigatorObj'])
      : undefined);
  const doc =
    options.documentObj ??
    (typeof document !== 'undefined'
      ? (document as MobileLifecycleTargets['documentObj'])
      : undefined);
  const win =
    options.windowObj ??
    (typeof window !== 'undefined'
      ? (window as MobileLifecycleTargets['windowObj'])
      : undefined);

  let currentSentinel: { released: boolean; release(): Promise<void> } | null = null;

  const requestWakeLock = async (): Promise<void> => {
    if (!nav?.wakeLock?.request) {
      return;
    }
    try {
      currentSentinel = await nav.wakeLock.request('screen');
    } catch {
      // Ignore wake lock rejection on unsupported platforms
    }
  };

  if (doc?.visibilityState === 'visible') {
    void requestWakeLock();
  }

  const handleVisibilityChange = (): void => {
    if (doc?.visibilityState === 'visible') {
      void requestWakeLock();
    } else if (doc?.visibilityState === 'hidden') {
      void driver.emergencyStop();
      void driver.disconnect();
    }
  };

  const handlePageHide = (): void => {
    void driver.emergencyStop();
    void driver.disconnect();
  };

  doc?.addEventListener('visibilitychange', handleVisibilityChange);
  win?.addEventListener('pagehide', handlePageHide);

  return () => {
    doc?.removeEventListener('visibilitychange', handleVisibilityChange);
    win?.removeEventListener('pagehide', handlePageHide);
    if (currentSentinel && !currentSentinel.released) {
      void currentSentinel.release();
      currentSentinel = null;
    }
  };
}
