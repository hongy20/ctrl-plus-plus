# Domain Spec: Vehicle Control & Speed Calibration (`vehicle-control`)

- **Status:** Approved v2.0 (Web Bluetooth Edition)
- **Hardware:** LEGO Technic 42124 Off-Road Buggy (`TechnicHub 88012`)
  - **Port A (`0x00`):** Drive Motor (`88013`, counterclockwise = forward, tire Ø = `71.6mm`)
  - **Port B (`0x01`):** Steering Motor (`88013`)
- **Stack:** TypeScript + Vite (Browser Web Bluetooth API `navigator.bluetooth`, LWP3 GATT Service `00001623-1212-efde-1623-785feabcd123`, `localStorage`, `vitest`)

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

### Connection & LWP3 Telemetry
- **VC-01:** `WHEN connect() is invoked, THE WebBleHubAdapter SHALL open the browser Web Bluetooth chooser filtered by LWP3 service UUID (00001623-1212-efde-1623-785feabcd123) so the user explicitly selects the target hub.`
- **VC-12:** `WHEN connected to the selected hub, THE VehicleDriver SHALL set the Hub LED (Port 0x32) to Cyan and subscribe to Port A (0x00) and Port B (0x01) position/speed notifications (LWP3 command 0x41).`
- **VC-02:** `WHILE connected, THE VehicleDriver SHALL emit motor encoder telemetry (deg, deg/s) at >= 10 Hz.`

### Steering Calibration & Control
- **VC-03:** `WHEN calibrateSteering() runs, THE VehicleDriver SHALL drive Port B at low power until stall in both directions to record leftLimit and rightLimit.`
- **VC-04:** `WHEN both steering limits are found, THE VehicleDriver SHALL set centerPos = (leftLimit + rightLimit) / 2, clamp future steering targets to 90% of [leftLimit, rightLimit], and persist calibration in localStorage.`
- **VC-05:** `WHEN setSteering(angleNorm) is called with [-1.0, +1.0], THE VehicleDriver SHALL command Port B (LWP3 GoToAbsolutePosition 0x0D) to the mapped encoder angle.`

### Speed Calibration, Control & Realistic Braking
- **VC-06:** `WHEN setSpeed(targetMps) is called, THE VehicleDriver SHALL convert m/s to motor deg/s using: degPerSec = (targetMps / (π * 0.0716)) * 360 * gearRatio * kCal (inverted for Port A CCW forward).`
- **VC-07:** `WHEN calibrateSpeed1m() runs, THE VehicleDriver SHALL drive a fixed encoder revolution count, accept measured ground distance (m), and persist kCal to localStorage.`
- **VC-11:** `WHEN brake(intensity) is called with [0.0, 1.0], THE VehicleDriver SHALL ramp speed down at 20 Hz along a smooth deceleration curve (a = intensity * aMax) and engage LWP3 hold-brake (127) only when |speed| < 0.05 m/s.`

### Safety, Fail-Safe & M1 Web Debug Panel
- **VC-08:** `WHEN BLE disconnects (gattserverdisconnected) or telemetry lags > 200ms while driving, THE VehicleDriver SHALL transition to EMERGENCY_STOP and cut motor power to 0.`
- **VC-09:** `WHEN the user taps the E-STOP button or presses SPACE/ESC, THE VehicleDriver SHALL immediately command brake/coast (power = 0) on Ports A and B.`
- **VC-10:** `WHILE using the M1 Web Debug Panel, THE UI SHALL provide touch buttons and keyboard bindings for Connect, Calibrate, W/S (drive), A/D (steer), B (progressive brake), C (center), 1/2/3 (speed presets), and E-STOP.`

---

## 3. Verification Plan
1. **Unit / Mock Tests (`tests/*.test.ts`):** Verify LWP3 byte packet encoding/decoding, state transitions, steering clamp math, `m/s` conversion, progressive braking, and `> 200ms` watchdog using `MockHubAdapter`.
2. **Bench Test (Android Chrome / Desktop Chrome, Wheels Off Ground):** Verify WebBLE connect picker, auto-homing steering center, and E-STOP.
3. **Floor Test (1-Meter Run):** Run 1m calibration from the Web Debug Panel on Android Chrome and verify `kCal` persistence in `localStorage`.
