# M1 Implementation Plan: Vehicle Control & Speed Calibration (TypeScript)

> **Spec Reference:** [`docs/specs/01-vehicle-control.md`](../specs/01-vehicle-control.md)

## Tasks (TDD Loop: Failing Test → Minimal Code → Pass → Commit)

- [ ] **Task 1: TypeScript Project Scaffold & Contracts (`VC-01`, `VC-02`)**
  - Create `package.json`, `tsconfig.json` (Node.js 20+, TypeScript, `vitest`, `tsx`, `node-poweredup`).
  - Create `src/contracts.ts`: `DriverState` type, `DiscoveredHub` & `MotorTelemetry` interfaces, and `HubAdapter` interface.
  - Verify: `npm test` (`tests/contracts.test.ts`)

- [ ] **Task 2: Mock & `node-poweredup` Hub Adapter (`VC-01`, `VC-02`, `VC-12`)**
  - Create `src/hub-adapter.ts`: wrap `node-poweredup` multi-hub discovery (`scanHubs()` returning `name`, `uuid`, `rssi`), single-hub `connect(uuid)` after confirmation, Hub LED indicator, `Port A`/`Port B` motor control, and `MockHubAdapter`.
  - Verify: `npm test` (`tests/hub-adapter.test.ts`)

- [ ] **Task 3: Steering Auto-Homing & Clamping (`VC-03`, `VC-04`, `VC-05`)**
  - Create `src/vehicle-driver.ts`: implement `calibrateSteering()` (left/right stall detection, `center = (left + right) / 2`, 90% range clamp) and `setSteering(norm)`.
  - Verify: `npm test` (`tests/steering.test.ts`)

- [ ] **Task 4: Speed Calibration & Progressive Braking (`VC-06`, `VC-07`, `VC-11`)**
  - Add `setSpeed(targetMps)` (`Tire Ø = 71.6mm`, `Port A` inverted), `calibrateSpeed1m()` with persistent `kCal`, and `brake(intensity)` closed-loop 20 Hz deceleration ramp + low-speed hold.
  - Verify: `npm test` (`tests/speed-brake.test.ts`)

- [ ] **Task 5: Dead-Man Switch & Keyboard Emergency Stop (`VC-08`, `VC-09`)**
  - Add `200ms` telemetry/disconnect watchdog (`EMERGENCY_STOP` → power `0`) and emergency stop handler.
  - Verify: `npm test` (`tests/safety.test.ts`)

- [ ] **Task 6: Hardware Bench & 1m Floor CLI (`src/cli/m1-cli.ts`) (`VC-10`)**
  - Create interactive terminal controller (`W/A/S/D`, `B` progressive brake, `C` center, `1/2/3` speed, `SPACE` e-stop) for real `TechnicHub 88012` bench & 1m floor calibration.
