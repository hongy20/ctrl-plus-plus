import { useEffect, useMemo, useState } from 'react';
import type { HubAdapter } from './contracts';
import { WebBleHubAdapter } from './hub-adapter';
import { attachMobileLifecycleGuards } from './lifecycle';
import { LOW_BATTERY_CUTOFF_PCT, VehicleDriver } from './vehicle-driver';
import { CalibrateTab } from './components/CalibrateTab';
import { ConnectTab } from './components/ConnectTab';
import { DebugTab } from './components/DebugTab';
import { DriveTab } from './components/DriveTab';
import { TopBar } from './components/TopBar';

export interface AppProps {
  adapter?: HubAdapter;
  driver?: VehicleDriver;
}

type TabKey = 'connect' | 'calibrate' | 'drive' | 'debug';

export function App(props: AppProps): React.JSX.Element {
  const { adapter: propAdapter, driver: propDriver } = props;
  const adapter = useMemo(() => propAdapter ?? new WebBleHubAdapter(), [propAdapter]);
  const driver = useMemo(() => propDriver ?? new VehicleDriver(adapter), [propDriver, adapter]);

  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('connect');
  const [tempDegC, setTempDegC] = useState<string | null>(null);

  // Attach lifecycle guards on mount and cleanup on unmount
  useEffect(() => {
    const cleanup = attachMobileLifecycleGuards({ driver });
    return () => {
      cleanup();
    };
  }, [driver]);

  // Attach driver listeners on mount (including StrictMode remounts) and clean up on unmount
  useEffect(() => {
    driver.attach();
    return () => {
      if (!propDriver) driver.destroy();
    };
  }, [driver, propDriver]);

  // Subscribe to driver updates and throttle Hub Temperature display with trailing update
  useEffect(() => {
    let lastUpdatedAt = 0;
    let latestFormatted: string | null = null;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;

    const syncTemp = () => {
      const t = driver.getTelemetry(0x3d) as { angleDeg: number } | undefined;
      if (!t || typeof t.angleDeg !== 'number') {
        if (trailingTimer) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        lastUpdatedAt = 0;
        latestFormatted = null;
        setTempDegC(null);
        return;
      }
      latestFormatted = String(Math.round(t.angleDeg / 10));
      const nowMs = Date.now();
      const elapsed = nowMs - lastUpdatedAt;
      if (lastUpdatedAt === 0 || elapsed >= 2000) {
        if (trailingTimer) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
        lastUpdatedAt = nowMs;
        setTempDegC(latestFormatted);
      } else if (!trailingTimer) {
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          lastUpdatedAt = Date.now();
          setTempDegC(latestFormatted);
        }, 2000 - elapsed);
      }
    };

    syncTemp();
    const unsubscribe = driver.subscribe(() => {
      syncTemp();
      setTick((t) => t + 1);
    });
    return () => {
      unsubscribe();
      if (trailingTimer) clearTimeout(trailingTimer);
    };
  }, [driver]);

  const profile = driver.getHubProfile();
  const driverState = driver.getState();
  const batteryLevel = driver.getBatteryLevel();
  const isLowBattery = batteryLevel !== null && batteryLevel < LOW_BATTERY_CUTOFF_PCT;

  const activeHubName =
    profile?.name ?? (adapter.isConnected() ? adapter.getHubName() ?? 'Technic Hub' : '');

  const handleEmergencyStop = async () => {
    await driver.emergencyStop();
    setTick((t) => t + 1);
  };

  const handleResume = async () => {
    await driver.resetEmergencyStop();
    setTick((t) => t + 1);
  };

  const handleUpdate = () => {
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 pb-16">
      <TopBar
        activeHubName={activeHubName}
        ledColor={profile?.ledColor}
        driverState={driverState}
        batteryLevel={batteryLevel}
        tempDegC={tempDegC}
        onResume={handleResume}
        onEmergencyStop={handleEmergencyStop}
      />

      {/* UI-08: Low Battery Cutoff Message */}
      {isLowBattery && (
        <div
          role="alert"
          className="bg-red-600 text-white px-4 py-2 text-center font-bold text-sm shadow"
        >
          Low-Battery Cutoff Active (&lt;10%) - Motor and Calibration Controls Disabled
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {activeTab === 'connect' && (
          <ConnectTab
            adapter={adapter}
            driver={driver}
            profile={profile}
            onNavigateToCalibrate={() => setActiveTab('calibrate')}
            onUpdate={handleUpdate}
          />
        )}
        {activeTab === 'calibrate' && (
          <CalibrateTab
            driver={driver}
            profile={profile}
            driverState={driverState}
            isLowBattery={isLowBattery}
            onUpdate={handleUpdate}
          />
        )}
        {activeTab === 'drive' && (
          <DriveTab
            driver={driver}
            profile={profile}
            driverState={driverState}
            isLowBattery={isLowBattery}
          />
        )}
        {activeTab === 'debug' && (
          <DebugTab driver={driver} isLowBattery={isLowBattery} />
        )}
      </main>

      {/* UI-01: Bottom Tabs Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-white shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('connect')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'connect' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-600'
          }`}
        >
          Connect
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('calibrate')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'calibrate'
              ? 'text-blue-600 border-t-2 border-blue-600'
              : 'text-gray-600'
          }`}
        >
          Calibrate
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drive')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'drive'
              ? 'text-blue-600 border-t-2 border-blue-600'
              : 'text-gray-600'
          }`}
        >
          Drive
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('debug')}
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            activeTab === 'debug' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-600'
          }`}
        >
          Debug
        </button>
      </nav>
    </div>
  );
}

export default App;
