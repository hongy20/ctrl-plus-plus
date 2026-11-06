# M1 Spec: Vehicle Control & Speed Calibration (`01-vehicle-control`)

- **Status:** Approved v1.0
- **Hardware:** LEGO Technic 42124 Off-Road Buggy (`TechnicHub 88012`)
  - **Port A:** Drive Motor (`88013`, counterclockwise = forward, tire Ø = `71.6mm`)
  - **Port B:** Steering Motor (`88013`)
- **Stack:** TypeScript / Node.js 20+ (`node-poweredup` / `@abandonware/noble`, LWP3 BLE protocol over stock LEGO firmware, `vitest`)

---

## 1. State Machine

```text
[DISCONNECTED] ──connect()──► [CONNECTING] ──BLE ready──► [CALIBRATING]
      ▲                                                         │
      │                        ┌──set_drive() / set_steer()──┐  ▼
      └──disconnect()── [EMERGENCY_STOP] ◄──fault/key── [READY / DRIVING]
```

---

## 2. EARS Behavioral Requirements

### Connection & Telemetry
- **VC-01:** `WHEN connect() is called, THE VehicleDriver SHALL scan for LWP3 UUID (00001623-1212-efde-1623-785feabcd123) and subscribe to Port A/B encoder notifications.`
- **VC-02:** `WHILE connected, THE VehicleDriver SHALL emit encoder telemetry (deg, deg/s) at >= 10 Hz.`

### Steering Calibration & Control
- **VC-03:** `WHEN calibrate_steering() runs, THE VehicleDriver SHALL drive Port B at low power until stall in both directions to record left_limit and right_limit.`
- **VC-04:** `WHEN both steering limits are found, THE VehicleDriver SHALL set center_pos = (left_limit + right_limit) / 2 and clamp future steering targets to 90% of [left_limit, right_limit].`
- **VC-05:** `WHEN set_steering(angle_norm) is called with [-1.0, +1.0], THE VehicleDriver SHALL command Port B to the mapped absolute encoder angle.`

### Speed Calibration, Control & Realistic Braking
- **VC-06:** `WHEN set_speed(target_mps) is called, THE VehicleDriver SHALL convert m/s to motor deg/s using: deg_per_sec = (target_mps / (π * 0.0716)) * 360 * gear_ratio * k_cal.`
- **VC-07:** `WHEN calibrate_speed_1m() runs, THE VehicleDriver SHALL drive a fixed encoder revolution count, accept measured ground distance (m), and persist k_cal to config.`
- **VC-11:** `WHEN brake(intensity) is called with [0.0, 1.0], THE VehicleDriver SHALL ramp speed down at 20 Hz along a smooth deceleration curve (a = intensity * a_max) and engage LWP3 hold-brake only when |speed| < 0.05 m/s.`

### Safety, Fail-Safe & Temporary CLI Controls
- **VC-08:** `WHEN BLE disconnects or telemetry lags > 200ms, THE VehicleDriver SHALL transition to EMERGENCY_STOP and cut motor power to 0.`
- **VC-09:** `WHEN the user presses SPACE or ESC, THE VehicleDriver SHALL immediately command brake/coast (power = 0) on Ports A and B.`
- **VC-10:** `WHILE running the M1 debug CLI, THE CLI SHALL map W/S (forward/reverse), A/D (steer left/right), B (progressive brake), C (center steer), and 1/2/3 (speed presets).`

---

## 3. Verification Plan
1. **Unit / Mock Tests (`tests/vehicle-driver.test.ts`):** Verify state transitions, steering clamp math, `m/s` conversion, progressive braking, and `> 200ms` watchdog timeout using `MockHubAdapter`.
2. **Bench Test (Wheels Off Ground):** Verify BLE connect, auto-homing steering center, and `SPACE` emergency stop.
3. **Floor Test (1-Meter Run):** Run `calibrateSpeed1m` to verify physical ground distance matches target.
