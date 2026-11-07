# Domain Spec: Vehicle Control & Speed Calibration (`vehicle-control`)

- **Status:** Approved v2.3 (React SPA + Offline PWA Edition)
- **Hardware:** LEGO Technic 42124 Off-Road Buggy (`TechnicHub 88012`)
  - **Port A (`0x00`):** Drive Motor (`88013`, counterclockwise = forward, tire Ø = `71.6mm`)
  - **Port B (`0x01`):** Steering Motor (`88013`)
- **Stack:** React 19 + TypeScript + Tailwind CSS + Vite (`navigator.bluetooth`, LWP3 Service `00001623-1212-efde-1623-785feabcd123`, `localStorage`, `vite-plugin-pwa`, `@vitejs/plugin-basic-ssl`, `vitest`)

---

## 1. State Machine

```text
[DISCONNECTED] ──connect()──► [CONNECTING] ──BLE ready──► [READY / DRIVING] ◄─┐
      ▲                                                      │   ▲    │       │
      │                                     resetEStop()─────┼───┘    ├───────┘
      │                                                      ▼        ▼  [CALIBRATING]
      └──disconnect()── [EMERGENCY_STOP] ◄───fault/e-stop────┴────────┘
```

---

## 2. EARS Behavioral Requirements

### Connection & LWP3 Telemetry
- **VC-01:** `WHEN connect() is invoked from a user tap, THE WebBleHubAdapter SHALL open the browser Web Bluetooth chooser filtered by LWP3 service UUID (00001623-1212-efde-1623-785feabcd123) so the user selects the target hub.`
- **VC-12:** `WHEN connected to the selected hub, THE VehicleDriver SHALL set the Hub LED (Port 0x32) to Cyan, subscribe to Port A (0x00) and Port B (0x01) telemetry (LWP3 command 0x41), load saved calibration from localStorage, and enter READY.`
- **VC-02:** `WHILE connected, THE VehicleDriver SHALL emit motor encoder telemetry (deg, deg/s) at >= 10 Hz.`

### Steering Calibration & Control
- **VC-03:** `WHEN calibrateSteering() is triggered from the Calibrate tab, THE VehicleDriver SHALL enter CALIBRATING, drive Port B at low power until stall (|deg/s| < 5 for 250ms) in both directions to record leftLimit and rightLimit, and return to READY.`
- **VC-04:** `WHEN both steering limits are found, THE VehicleDriver SHALL set centerPos = (leftLimit + rightLimit) / 2, clamp future steering targets to 90% of [leftLimit, rightLimit], and persist calibration in localStorage.`
- **VC-05:** `WHEN setSteering(angleNorm) is called with [-1.0, +1.0], THE VehicleDriver SHALL command Port B (LWP3 GoToAbsolutePosition 0x0D) to the mapped encoder angle.`

### Speed Calibration, Control & Realistic Braking
- **VC-06:** `WHEN setSpeed(targetMps) is called, THE VehicleDriver SHALL map m/s to LWP3 Port A speed percentage [-100, +100] using Tire Ø = 71.6mm and empirical kCal (inverted for Port A CCW forward).`
- **VC-07:** `WHEN startSpeedCalRun() is triggered, THE VehicleDriver SHALL drive a fixed encoder revolution target and stop; WHEN saveSpeedCal(measuredMeters) is called, IT SHALL compute and persist kCal in localStorage.`
- **VC-11:** `WHEN brake(intensity) is called with [0.0, 1.0], THE VehicleDriver SHALL ramp speed down at 20 Hz along a smooth deceleration curve (a = intensity * aMax) and engage LWP3 hold-brake (127) only when |speed| < 0.05 m/s.`

### Safety, Fail-Safe & Multi-View SPA Shell
- **VC-08:** `WHEN BLE disconnects (gattserverdisconnected) or telemetry lags > 200ms while driving, THE VehicleDriver SHALL transition to EMERGENCY_STOP and cut motor power to 0.`
- **VC-14:** `WHEN the page is backgrounded or unloaded (visibilityState === 'hidden' or pagehide), THE VehicleDriver SHALL immediately command motor power to 0 and disconnect BLE (gatt.disconnect()) so the Hub hardware fail-safe engages.`
- **VC-09:** `WHEN the user taps the persistent top-bar E-STOP button, THE VehicleDriver SHALL immediately command brake/coast (power = 0) on Ports A and B; WHEN resetEmergencyStop() is called while BLE is connected, IT SHALL return to READY.`
- **VC-10:** `WHILE navigating between SPA tabs (Connect, Calibrate, Debug) without page reload, THE App SHALL preserve the active VehicleDriver session and keep the global status + E-STOP header visible.`
- **VC-13:** `WHILE connected to the hub (or active in the app), THE App SHALL hold a Screen Wake Lock (navigator.wakeLock.request('screen')) and re-acquire it on visibility restore so the mobile screen never dims or sleeps.`

---

## 3. Verification Plan
1. **Unit / Mock Tests (`tests/*.test.ts`):** Verify LWP3 byte packet encoding/decoding, state transitions (including `resetEmergencyStop`), steering clamp math, 2-step `kCal` calibration, progressive braking, and `> 200ms` watchdog using `MockHubAdapter`.
2. **Bench Test (Android Chrome PWA, Wheels Off Ground):** Verify WebBLE connect picker, tab switching without BLE drop, auto-homing steering center, and persistent top-bar E-STOP + Resume.
3. **Floor Test (1-Meter Run):** Run 2-step 1m calibration from the `Calibrate` tab on Android Chrome and verify `kCal` persistence in `localStorage`.
