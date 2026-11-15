# Milestone 2 Implementation Plan: `Drive` Cockpit HUD (`m2-drive-hud`)

- **Specs Covered:** [`docs/specs/ui.md`](../specs/ui.md) (`UI-01`, `UI-09`..`UI-13`), [`docs/specs/control.md`](../specs/control.md) (`CTL-06`)
- **Workflow:** Mode B Task-by-Task TDD (`Spec-Review` ──► `Test-Writer` ──► `Implementer`)

---

## Task Checklist

- [x] **Task 1 — `CTL-06` Partial Target Braking & M2 Tuning Constants (`src/driver/`, `src/vehicle-driver.ts`)**
  - Extend `CTL-06` (`brake(intensity?, targetSpeedMps = 0)`) to smoothly ramp `currentSpeedMps` toward any `targetSpeedMps` along `a = intensity * aMax` at `BRAKE_TICK_HZ`, staying in `DRIVING` when `targetSpeedMps !== 0` and engaging `StartPower(127)` hold-brake (`READY`) only when `targetSpeedMps === 0` and `|speed| < HOLD_BRAKE_SPEED_MPS`.
  - Export M2 UI tuning constants (`BRAKE_TAP_MAX_MS`, `BRAKE_TAP_STEP_RATIO`, `TILT_DEADZONE_DEG`, `TILT_MAX_DEG`) and pure helper functions for live `m/s` speed telemetry calculation and tilt angle normalization (`[-1.0, +1.0]` with baseline + deadzone).

- [x] **Task 2 — `Drive` Cockpit HUD Component & SPA Navigation (`src/components/DriveTab.tsx`, `src/App.tsx`)**
  - Add `Drive` tab to bottom navigation (`UI-01`) and implement `DriveTab.tsx` (`≤ 300` lines):
    - Live cockpit gauges (`UI-09`): Speed (`m/s`), Target Throttle (`%`), and Steering (`%` + encoder `°`).
    - Touch mode (`UI-10`, `UI-11`): Spring-return horizontal steering slider/wheel (`-100%..+100%` → `0` on release) and vertical throttle slider with **Cruise / Speed Hold** toggle (dead-man release when OFF; latched target speed when ON).
    - Tilt mode (`UI-12`): `Touch | Tilt` toggle capturing initial `(beta, gamma)` neutral baseline (`±TILT_DEADZONE_DEG` to `±TILT_MAX_DEG`) with a "Re-Center Tilt" button and automatic stop on toggle-off.
    - Tap vs. Hold Brake (`UI-13`): Short tap (`< BRAKE_TAP_MAX_MS`) steps target speed `BRAKE_TAP_STEP_RATIO` (`20%`) toward `0` and smoothly ramps down via `brake(intensity, newTargetMps)`; press-and-hold (`>= BRAKE_TAP_MAX_MS`) ramps all the way to `0` + hold-brake (`127`).
