# M1 Implementation Plan: Web Bluetooth Vehicle Control & Speed Calibration

> **Spec Reference:** [`docs/specs/vehicle-control.md`](../specs/vehicle-control.md)

## Tasks (TDD Loop: Failing Test → Minimal Code → Pass → Commit)

- [ ] **Task 1: Vite + TypeScript Scaffold & Contracts (`VC-01`, `VC-02`)**
  - Create `package.json`, `tsconfig.json`, `vite.config.ts` (TypeScript, `vite`, `vitest`).
  - Create `src/contracts.ts`: `DriverState` type, `MotorTelemetry` & `CalibrationData` interfaces, and `HubAdapter` interface.
  - Verify: `npm test` (`tests/contracts.test.ts`)

- [ ] **Task 2: LWP3 Packet Codec, `WebBleHubAdapter` & `MockHubAdapter` (`VC-01`, `VC-02`, `VC-12`)**
  - Create `src/lwp3.ts`: pure functions to encode/decode LEGO Wireless Protocol v3 GATT bytes (Port Input Format Setup `0x41`, Port Value `0x45`, StartSpeed `0x07`, GoToAbsolutePosition `0x0D`, SetHubLed `0x51`).
  - Create `src/hub-adapter.ts`: `WebBleHubAdapter` using `navigator.bluetooth.requestDevice()` (UUID `00001623-1212-efde-1623-785feabcd123`) and `MockHubAdapter` for deterministic tests.
  - Verify: `npm test` (`tests/lwp3-adapter.test.ts`)

- [ ] **Task 3: Steering Auto-Homing & Clamping (`VC-03`, `VC-04`, `VC-05`)**
  - Create `src/vehicle-driver.ts`: implement `calibrateSteering()` (left/right stall detection, `center = (left + right) / 2`, 90% range clamp, `localStorage` save) and `setSteering(norm)`.
  - Verify: `npm test` (`tests/steering.test.ts`)

- [ ] **Task 4: Speed Calibration & Progressive Braking (`VC-06`, `VC-07`, `VC-11`)**
  - Add `setSpeed(targetMps)` (`Tire Ø = 71.6mm`, `Port A` CCW forward), `calibrateSpeed1m(measuredMeters)` with `localStorage` `kCal`, and `brake(intensity)` 20 Hz deceleration ramp + low-speed hold.
  - Verify: `npm test` (`tests/speed-brake.test.ts`)

- [ ] **Task 5: Dead-Man Watchdog & Emergency Stop (`VC-08`, `VC-09`)**
  - Add `200ms` telemetry/disconnect watchdog (`EMERGENCY_STOP` → power `0`) and immediate `emergencyStop()`.
  - Verify: `npm test` (`tests/safety.test.ts`)

- [ ] **Task 6: M1 Web Debug Panel (`index.html` + `src/main.ts`) (`VC-10`)**
  - Build mobile-friendly M1 Web Debug Page (Connect Hub, Calibrate Steering, 1m Speed Calibration, Touch + `W/A/S/D/B/C/1/2/3/SPACE` controls, live telemetry & E-STOP button).
  - Verify: `npm run build` + `npm test`.
