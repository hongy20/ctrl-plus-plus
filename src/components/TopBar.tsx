import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Thermometer,
} from 'lucide-react';
import type { DriverState, HubLedColor } from '../contracts';

export const LED_COLOR_MAP: Record<number, string> = {
  1: '#ff69b4', // Pink
  2: '#800080', // Purple
  3: '#0000ff', // Blue
  4: '#87cefa', // Light Blue
  5: '#00ffff', // Cyan
  6: '#00ff00', // Green
  7: '#ffff00', // Yellow
  8: '#ffa500', // Orange
  9: '#ff0000', // Red
  10: '#ffffff', // White
};

export interface TopBarProps {
  activeHubName: string;
  ledColor?: HubLedColor;
  driverState: DriverState;
  batteryLevel: number | null;
  tempDegC: string | null;
  onResume: () => void | Promise<void>;
  onEmergencyStop: () => void | Promise<void>;
}

export function TopBar({
  activeHubName,
  ledColor,
  driverState,
  batteryLevel,
  tempDegC,
  onResume,
  onEmergencyStop,
}: TopBarProps): React.JSX.Element {
  const BatteryIcon =
    batteryLevel === null
      ? BatteryFull
      : batteryLevel < 20
        ? BatteryWarning
        : batteryLevel < 40
          ? BatteryLow
          : batteryLevel < 75
            ? BatteryMedium
            : BatteryFull;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-slate-900 text-white shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <span
          data-testid="led-swatch"
          className="inline-block w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rounded-full border border-gray-400"
          style={{ backgroundColor: LED_COLOR_MAP[ledColor ?? 10] ?? '#ffffff' }}
        />
        <span className="font-semibold text-sm sm:text-base truncate">
          {activeHubName || 'Ctrl++'}
        </span>
        <span className="shrink-0 text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-700 text-slate-200 uppercase tracking-wider whitespace-nowrap">
          {driverState}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {(batteryLevel !== null || tempDegC !== null) && (
          <div
            data-testid="topbar-telemetry"
            className="flex flex-col sm:flex-row items-start sm:items-center gap-0.5 sm:gap-3 text-xs sm:text-sm leading-tight whitespace-nowrap tabular-nums"
          >
            {batteryLevel !== null && (
              <span
                title="Hub Battery Level"
                data-battery-warning={batteryLevel < 20 ? 'true' : 'false'}
                className={`inline-flex items-center gap-1 ${
                  batteryLevel < 20 ? 'text-red-400 font-bold' : 'text-slate-200'
                }`}
              >
                <BatteryIcon aria-hidden="true" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                {batteryLevel}%
              </span>
            )}
            {tempDegC !== null && (
              <span
                title="Hub Internal Temperature"
                className="inline-flex items-center gap-1 text-slate-200"
              >
                <Thermometer aria-hidden="true" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                {tempDegC}°C
              </span>
            )}
          </div>
        )}
        {driverState === 'EMERGENCY_STOP' ? (
          <button
            type="button"
            onClick={onResume}
            className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1 text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onEmergencyStop}
            className="shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1 text-xs sm:text-sm bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow"
          >
            E-STOP
          </button>
        )}
      </div>
    </header>
  );
}
