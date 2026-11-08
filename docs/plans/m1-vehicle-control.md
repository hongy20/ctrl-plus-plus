# M1 Implementation Plan: Web Bluetooth Vehicle Control, Profiles, Storage & Calibration

> **Spec References:** [`docs/specs/profile.md`](../specs/profile.md) (`PRF-01`..`PRF-02`), [`docs/specs/storage.md`](../specs/storage.md) (`STR-01`..`STR-04`), [`docs/specs/calibration.md`](../specs/calibration.md) (`CAL-01`..`CAL-03`), [`docs/specs/control.md`](../specs/control.md) (`CTL-01`..`CTL-08`), [`docs/specs/ui.md`](../specs/ui.md) (`UI-01`..`UI-06`), [`docs/specs/tech.md`](../specs/tech.md) (`TCH-01`..`TCH-06`)

## Tasks (TDD Loop: Failing Test → Minimal Code → Pass → Commit)

- [x] **Task 1: Vite + React + TypeScript + ESLint + PWA Scaffold & Contracts (`PRF-01`, `STR-01`, `CTL-01`, `TCH-02`, `TCH-05`, `TCH-06`)**
  - Initialize via `npm init -y` and `npm i` / `npm i -D` (React, TypeScript, Tailwind CSS, ESLint + `typescript-eslint`, Vite, `@vitejs/plugin-basic-ssl`, `vite-plugin-pwa`, Vitest), configure `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, and `.gitignore` (`node_modules/`, `dist/`).
  - Create `src/contracts.ts`: `DriverState` type (`DISCONNECTED | CONNECTING | READY | DRIVING | CALIBRATING | EMERGENCY_STOP`), `VehicleProfile`, `HubProfile` (preset + calibration + tuning overrides like `tireDiameterMm` & `defaultBrakeIntensity`), `MotorTelemetry`, and `HubAdapter`.
  - Verify: `npm run lint && npm test` (`tests/contracts.test.ts`)

- [ ] **Task 2: LEGO Wireless Protocol Codec, `WebBleHubAdapter` & `MockHubAdapter` (`CTL-01`, `CTL-02`)**
  - Create `src/lego-protocol.ts`: pure functions to encode/decode LEGO Wireless Protocol v3 GATT bytes (Attached I/O `0x04`, Port Input Format Setup `0x41`, Port Value `0x45` for encoders & Hub Temp Port `0x3D`, all Hub Properties `0x01` `0x01..0x0D`, StartSpeed `0x07`, GoToAbsolutePosition `0x0D`, SetHubLed `0x51`).
  - Create `src/hub-adapter.ts`: `WebBleHubAdapter` using `navigator.bluetooth.requestDevice()` (UUID `00001623-1212-efde-1623-785feabcd123`), logging all discovered Hub properties/ports, and `MockHubAdapter` for unit tests.
  - Verify: `npm test` (`tests/lego-protocol-adapter.test.ts`)

- [ ] **Task 3: Official Vehicle Profiles & Per-Hub Storage (`PRF-01`, `PRF-02`, `STR-01`..`STR-04`)**
  - Create `src/profile.ts` & `src/storage.ts`: static catalog of official LEGO sets (`42124 Off-Road Buggy` default with `71.6mm` wheels, Port A CCW drive, Port B steer) and `localStorage` CRUD keyed by `hubId` (`getOrCreateHubProfile()`, `saveHubCalibration()`, `updateHubParameters()`, `listRememberedHubs()`, `resetHubCalibration()`, `forgetHub()`).
  - Verify: `npm test` (`tests/profile-storage.test.ts`)

- [ ] **Task 4: Steering/Speed Calibration & Runtime Control (`CAL-01`..`CAL-03`, `CTL-03`..`CTL-06`)**
  - Create `src/vehicle-driver.ts`: enforces `CALIBRATING` teleop lock (`CTL-03`), implements `calibrateSteering()` (`|deg/s| < 5` for `250ms`), 2-step `startSpeedCalRun()` + `saveSpeedCal(measuredMeters)`, `setSteering(norm)`, `setSpeed(targetMps)`, and `brake(intensity?)` (`20 Hz` smooth deceleration ramp + low-speed hold `< 0.05 m/s`).
  - Verify: `npm test` (`tests/control-calibration.test.ts`)

- [ ] **Task 5: Vehicle Watchdog & Mobile Lifecycle Guards (`CTL-07`, `CTL-08`, `UI-02`, `UI-03`)**
  - Add `200ms` telemetry/disconnect watchdog (`EMERGENCY_STOP` → power `0`), `emergencyStop()` / `resetEmergencyStop()`, Screen Wake Lock manager (`navigator.wakeLock.request('screen')`), and synchronous `emergencyStop() + disconnect()` on `visibilityState === 'hidden'` / `pagehide`.
  - Verify: `npm test` (`tests/safety.test.ts`)

- [ ] **Task 6: Multi-View React SPA Shell (`Connect`, `Calibrate`, `Debug`) (`UI-01`, `UI-04`..`UI-06`)**
  - Build React SPA (`Ctrl++`) with shared `VehicleDriver` context, persistent top status + Battery `%` + Temp `°C` + **E-STOP / Resume** bar, and bottom tabs:
    - `Connect`: WebBLE connect, inline Hub rename, loaded `HubProfile` summary card with **"Tweak / Calibrate"** button (navigates to `Calibrate` tab), and Remembered Hubs list.
    - `Calibrate`: Official LEGO Set profile selector (`42124 Off-Road Buggy`), Auto-Calibrate Steering, 2-Step 1m Speed Calibration, and manual parameter inputs (`tireDiameterMm`, `steeringClampRatio`, `defaultBrakeIntensity`).
    - `Debug`: Speed presets, steering slider, progressive brake button, live encoder telemetry, and LEGO Wireless Protocol property/port inspector.
  - Verify: `npm test && npm run build`.
