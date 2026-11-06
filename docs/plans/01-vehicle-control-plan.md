# M1 Implementation Plan: Vehicle Control & Speed Calibration

> **Spec Reference:** [`docs/specs/01-vehicle-control.md`](../specs/01-vehicle-control.md)

## Tasks (TDD Loop: Failing Test → Minimal Code → Pass → Commit)

- [ ] **Task 1: Project Scaffold & Contracts (`VC-01`, `VC-02`)**
  - Create `pyproject.toml` (`python >= 3.11`, `bleak`, `pytest`, `pytest-asyncio`).
  - Create `src/lego_autopilot/contracts.py`: `DriverState` enum, `MotorTelemetry` dataclass, and `BleTransport` protocol.
  - Verify: `pytest tests/test_contracts.py`

- [ ] **Task 2: LWP3 Packet Codec (`VC-01`, `VC-05`, `VC-06`)**
  - Create `src/lego_autopilot/lwp3.py`: encode motor power/speed/angle commands and decode port encoder notifications for `Port A` (0x00) and `Port B` (0x01).
  - Verify: `pytest tests/test_lwp3.py`

- [ ] **Task 3: Steering Auto-Homing & Clamping (`VC-03`, `VC-04`, `VC-05`)**
  - Create `src/lego_autopilot/vehicle_driver.py`: implement `calibrate_steering()` (left/right stall detection, `center = (left + right) / 2`, 90% range clamp) and `set_steering(norm)`.
  - Verify: `pytest tests/test_steering.py` (using `MockBleTransport`)

- [ ] **Task 4: Speed Calibration & Progressive Braking (`VC-06`, `VC-07`, `VC-11`)**
  - Add `set_speed(target_mps)` (`Tire Ø = 71.6mm`, `Port A` inverted), `calibrate_speed_1m()` with persistent `k_cal`, and `brake(intensity)` closed-loop 20 Hz deceleration ramp + low-speed hold.
  - Verify: `pytest tests/test_speed.py`

- [ ] **Task 5: Dead-Man Switch & Keyboard Emergency Stop (`VC-08`, `VC-09`)**
  - Add `200ms` telemetry/disconnect watchdog (`EMERGENCY_STOP` → power `0`) and CLI `SPACE`/`ESC` emergency brake handler.
  - Verify: `pytest tests/test_safety.py`

- [ ] **Task 6: Hardware Bench & 1m Floor CLI (`scripts/m1_cli.py`)**
  - Create interactive CLI for real `TechnicHub 88012` bench test (wheels off ground) and 1m floor calibration.
