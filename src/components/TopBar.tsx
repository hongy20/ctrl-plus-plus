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
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-slate-900 text-white shadow-md">
      <div className="flex items-center space-x-3">
        <span
          data-testid="led-swatch"
          className="inline-block w-4 h-4 rounded-full border border-gray-400"
          style={{ backgroundColor: LED_COLOR_MAP[ledColor ?? 10] ?? '#ffffff' }}
        />
        <span className="font-semibold">{activeHubName || 'Ctrl++'}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200 uppercase tracking-wider">
          {driverState}
        </span>
      </div>

      <div className="flex items-center space-x-3 text-sm">
        {batteryLevel !== null && (
          <span
            data-battery-warning={batteryLevel < 20 ? 'true' : 'false'}
            className={batteryLevel < 20 ? 'text-red-400 font-bold' : 'text-slate-200'}
          >
            {batteryLevel}%
          </span>
        )}
        {tempDegC !== null && <span className="text-slate-200">{tempDegC}°C</span>}
        {driverState === 'EMERGENCY_STOP' ? (
          <button
            type="button"
            onClick={onResume}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onEmergencyStop}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow"
          >
            E-STOP
          </button>
        )}
      </div>
    </header>
  );
}
