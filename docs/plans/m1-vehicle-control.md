# M1 Implementation Plan: Web Bluetooth Vehicle Control & Speed Calibration

> **Spec References:** [`docs/specs/vehicle-control.md`](../specs/vehicle-control.md) (`VC-01`..`VC-11`), [`docs/specs/mobile-web-ui.md`](../specs/mobile-web-ui.md) (`UI-01`..`UI-06`), [`docs/specs/ci-cd.md`](../specs/ci-cd.md) (`CI-01`..`CI-03`)

## Tasks (TDD Loop: Failing Test → Minimal Code → Pass → Commit)

- [ ] **Task 1: Vite + React + TypeScript + ESLint + PWA Scaffold & Contracts (`VC-01`, `VC-03`, `CI-02`)**
  - Create `package.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts` (React 19, TypeScript, Tailwind CSS, ESLint 9 + `typescript-eslint`, `@vitejs/plugin-basic-ssl`, `vite-plugin-pwa`, `vitest`), and `.gitignore` (`node_modules/`, `dist/`).
  - Create `src/contracts.ts`: `DriverState` type, `MotorTelemetry` & `CalibrationData` interfaces, and `HubAdapter` interface.
  - Verify: `npm run lint && npm test` (`tests/contracts.test.ts`)

- [ ] **Task 2: LWP3 Packet Codec, `WebBleHubAdapter` & `MockHubAdapter` (`VC-01`, `VC-02`, `VC-03`)**
  - Create `src/lwp3.ts`: pure functions to encode/decode LEGO Wireless Protocol v3 GATT bytes (Attached I/O `0x04`, Port Input Format Setup `0x41`, Port Value `0x45` for encoders & Hub Temp Port `0x3D`, all Hub Properties `0x01` `0x01..0x0D`, StartSpeed `0x07`, GoToAbsolutePosition `0x0D`, SetHubLed `0x51`).
  - Create `src/hub-adapter.ts`: `WebBleHubAdapter` using `navigator.bluetooth.requestDevice()` (UUID `00001623-1212-efde-1623-785feabcd123`), logging all discovered Hub properties/ports, and `MockHubAdapter` for unit tests.
  - Verify: `npm test` (`tests/lwp3-adapter.test.ts`)

- [ ] **Task 3: Steering Auto-Homing & Per-Hub Storage Manager (`VC-04`, `VC-05`, `VC-06`)**
  - Create `src/hub-storage.ts` & `src/vehicle-driver.ts`: implement per-`hubId` `localStorage` registry (`listRememberedHubs()`, `saveHubProfile()`, `forgetHub(hubId)`, `resetHubCalibration(hubId)`), `calibrateSteering()` (`|deg/s| < 5` for `250ms`, 90% clamp), and `setSteering(norm)`.
  - Verify: `npm test` (`tests/steering.test.ts`)

- [ ] **Task 4: Speed Calibration & Progressive Braking (`VC-07`, `VC-08`, `VC-09`)**
  - Add `setSpeed(targetMps)` (`Tire Ø = 71.6mm`, `Port A` CCW forward), 2-step `startSpeedCalRun()` + `saveSpeedCal(measuredMeters)` with per-`hubId` `localStorage` `kCal`, and `brake(intensity)` 20 Hz deceleration ramp + low-speed hold.
  - Verify: `npm test` (`tests/speed-brake.test.ts`)

- [ ] **Task 5: Vehicle Watchdog & Mobile Lifecycle Guards (`VC-10`, `VC-11`, `UI-02`, `UI-03`)**
  - Add `200ms` telemetry/disconnect watchdog (`EMERGENCY_STOP` → power `0`), `emergencyStop()` / `resetEmergencyStop()`, Screen Wake Lock manager (`navigator.wakeLock.request('screen')`), and synchronous `emergencyStop() + disconnect()` on `visibilityState === 'hidden'` / `pagehide`.
  - Verify: `npm test` (`tests/safety.test.ts`)

- [ ] **Task 6: Multi-View React SPA Shell (`Connect`, `Calibrate`, `Debug`) (`UI-01`, `UI-04`, `UI-05`, `UI-06`)**
  - Build React SPA with shared `VehicleDriver` context, persistent top status + Battery `%` + Temp `°C` + **E-STOP / Resume** bar, and bottom tab navigation (`Connect` with Remembered Hubs manager / Forget Device / Rename, `Calibrate`, `Debug`).
  - Verify: `npm test && npm run build`.
