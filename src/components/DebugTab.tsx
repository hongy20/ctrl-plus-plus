import { useMemo, useState } from 'react';
import { createLatestCoalescer } from '../driver/control';
import type { VehicleDriver } from '../vehicle-driver';

export interface DebugTabProps {
  driver: VehicleDriver;
  isLowBattery: boolean;
}

export function DebugTab({ driver, isLowBattery }: DebugTabProps): React.JSX.Element {
  const [steeringValue, setSteeringValue] = useState(0);
  const steerCoalescer = useMemo(
    () => createLatestCoalescer((val: number) => driver.setSteering(val)),
    [driver],
  );

  const handleSteeringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSteeringValue(val);
    steerCoalescer.schedule(val);
  };

  const telemetry = driver.getTelemetry() as Map<
    number,
    { angleDeg: number; speedDegPerSec: number }
  >;
  const hubProps = driver.getHubProperties();
  const attachedPorts = driver.getAttachedPorts();

  return (
    <div className="space-y-6">
      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <h2 className="text-lg font-bold">Drive & Steering Controls</h2>
        <div className="flex space-x-3">
          <button
            type="button"
            disabled={isLowBattery}
            onClick={() => void driver.setSpeed(1.0).catch(() => {})}
            className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold rounded"
          >
            Forward
          </button>
          <button
            type="button"
            disabled={isLowBattery}
            onClick={() => void driver.setSpeed(-1.0).catch(() => {})}
            className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold rounded"
          >
            Reverse
          </button>
          <button
            type="button"
            disabled={isLowBattery}
            onClick={() => void driver.brake().catch(() => {})}
            className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-300 text-white font-semibold rounded"
          >
            Brake
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Steering: {steeringValue}
          </label>
          <input
            type="range"
            aria-label="Steering"
            min="-1"
            max="1"
            step="0.05"
            disabled={isLowBattery}
            value={steeringValue}
            onChange={handleSteeringChange}
            className="w-full disabled:opacity-50"
          />
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
        <h2 className="text-lg font-bold">Live Telemetry</h2>
        {telemetry.size === 0 ? (
          <p className="text-sm text-gray-500">No telemetry data received yet.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {Array.from(telemetry.entries()).map(([port, t]) => (
              <div key={port} className="p-2 bg-gray-50 rounded">
                Port {port}: Angle {t.angleDeg}° | Speed {t.speedDegPerSec.toFixed(1)}°/s
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
        <h2 className="text-lg font-bold">Hub Properties Inspector</h2>
        {hubProps.size === 0 ? (
          <p className="text-sm text-gray-500">No hub properties loaded.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {Array.from(hubProps.entries()).map(([prop, val]) => (
              <div key={prop} className="p-2 bg-gray-50 rounded">
                Prop 0x{prop.toString(16)}: {String(val)}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-3">
        <h2 className="text-lg font-bold">Attached I/O Inspector</h2>
        {attachedPorts.size === 0 ? (
          <p className="text-sm text-gray-500">No attached I/O detected.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {Array.from(attachedPorts.entries()).map(([port, io]) => (
              <div key={port} className="p-2 bg-gray-50 rounded">
                Port {port}:{' '}
                {io.attached
                  ? `0x${(io.ioTypeId ?? 0).toString(16).padStart(4, '0')} (${io.ioTypeId})`
                  : 'detached'}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
