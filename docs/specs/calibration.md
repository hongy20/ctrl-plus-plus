# Domain Spec: Steering & Speed Calibration (`calibration`)

- **Status:** Approved v1.0 (Physical Steering Auto-Homing & 2-Step 1m Speed Calibration)
- **Dependencies:** [`docs/specs/control.md`](control.md) (`CTL-03` `CALIBRATING` lock state), [`docs/specs/storage.md`](storage.md) (`STR-02` persistence)
- **Stack:** TypeScript (`vitest`)

---

## 1. Calibration Workflows

```text
[Steering Auto-Homing (CAL-01, CAL-02)]
  Enter CALIBRATING (CTL-03) ──► Drive Steer Port Left until Stall (CAL-01) ──► Record leftLimit
                             ──► Drive Steer Port Right until Stall (CAL-01) ──► Record rightLimit
                             ──► centerPos = (leftLimit + rightLimit) / 2 ──► Command centerPos
                             ──► Persist via saveHubCalibration() (STR-02) ──► Return to READY

[2-Step 1m Speed Calibration (CAL-03)]
  Step 1: startSpeedCalRun() ──► Enter CALIBRATING ──► Drive fixed encoder target (e.g., 1600°) ──► Stop
  Step 2: saveSpeedCal(measuredMeters) ──► kCal = measuredMeters / theoreticalMeters
                                       ──► Persist via saveHubCalibration() (STR-02) ──► Return to READY
```

---

## 2. Tuning Constants

This table is the only place these values are stated. Code exports each one under this name, and tests reference the name, not the literal.

| Constant | Value | Used by |
| :--- | :--- | :--- |
| `STALL_SPEED_DEG_S` | `5` | `CAL-01` |
| `STALL_HOLD_MS` | `250` | `CAL-01` |

---

## 3. EARS Behavioral Requirements

### Steering Limit & Center Calibration
- **CAL-01:** `WHEN calibrateSteering() is invoked, THE System SHALL transition VehicleDriver to CALIBRATING (CTL-03), drive the steering motor at low power in both directions until mechanical stall is detected (|deg/s| < STALL_SPEED_DEG_S for STALL_HOLD_MS), and record leftLimit and rightLimit.`
- **CAL-02:** `WHEN both steering limits are recorded, THE System SHALL compute centerPos = (leftLimit + rightLimit) / 2, command the steering motor to centerPos, persist { leftLimit, rightLimit, centerPos } to the active HubProfile (STR-02), and return VehicleDriver to READY.`

### Empirical Ground-Speed Calibration (`kCal`)
- **CAL-03:** `WHEN startSpeedCalRun() is invoked, THE System SHALL transition VehicleDriver to CALIBRATING, drive the drive motor for a fixed encoder revolution target, and stop; WHEN saveSpeedCal(measuredMeters) is subsequently called with the user's floor measurement, IT SHALL compute kCal = measuredMeters / theoreticalMeters (using active tireDiameterMm), persist kCal to the active HubProfile (STR-02), and return VehicleDriver to READY.`

---

## 4. Verification Plan
1. **Unit Tests (`tests/control-calibration.test.ts`):** Verify stall detection (`STALL_SPEED_DEG_S`, `STALL_HOLD_MS`), `centerPos` calculation, `CALIBRATING` lock entry/exit, 2-step `kCal` math from `tireDiameterMm` and `measuredMeters`, and persistence into `HubProfile`.
2. **Floor Test:** Run steering auto-homing and a 1-meter tape-measure speed run on the physical `42124 Off-Road Buggy`.
