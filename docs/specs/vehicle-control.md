# Domain Spec: Vehicle Control & Speed Calibration (`vehicle-control`)

- **Status:** Approved v2.4 (Headless Vehicle Driver & LWP3 Protocol)
- **Hardware:** LEGO Technic 42124 Off-Road Buggy (`TechnicHub 88012`)
  - **Port A (`0x00`):** Drive Motor (`88013`, counterclockwise = forward, tire Ø = `71.6mm`)
  - **Port B (`0x01`):** Steering Motor (`88013`)
- **Stack:** TypeScript (`navigator.bluetooth`, LWP3 Service `00001623-1212-efde-1623-785feabcd123`, `localStorage`, `vitest`)

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

### BLE Connection & LWP3 Telemetry
- **VC-01:** `WHEN connect() is invoked, THE WebBleHubAdapter SHALL open the browser Web Bluetooth chooser filtered by LWP3 service UUID (00001623-1212-efde-1623-785feabcd123) and connect to the GATT characteristic (00001624-1212-efde-1623-785feabcd123).`
- **VC-02:** `WHEN connected to the selected hub, THE VehicleDriver SHALL set the Hub LED (Port 0x32) to Cyan, query all LWP3 Hub Properties (0x01..0x0D including MAC Address 0x0D, FW/HW versions, RSSI, Battery Type), subscribe to Port A/B encoders (0x00/0x01), Hub Temperature (Port 0x3D), and Battery Level (Property 0x06), load calibration for that hubId from localStorage, and enter READY.`
- **VC-03:** `WHILE connected, THE VehicleDriver SHALL emit motor encoder telemetry (deg, deg/s) at >= 10 Hz, Hub battery (%), Hub temperature (°C), log all discovered Hub Properties and Attached I/O ports (0x04), and support renaming the Hub in flash via setHubName() (Property 0x01).`

### Steering Calibration & Control
- **VC-04:** `WHEN calibrateSteering() runs, THE VehicleDriver SHALL enter CALIBRATING, drive Port B at low power until stall (|deg/s| < 5 for 250ms) in both directions to record leftLimit and rightLimit, and return to READY.`
- **VC-05:** `WHEN both steering limits are found, THE VehicleDriver SHALL set centerPos = (leftLimit + rightLimit) / 2, clamp future steering targets to 90% of [leftLimit, rightLimit], and persist the Hub profile (hubId, name, lastConnectedAt, calibration) in localStorage (with listRememberedHubs() and forgetHub(hubId) management helpers).`
- **VC-06:** `WHEN setSteering(angleNorm) is called with [-1.0, +1.0], THE VehicleDriver SHALL command Port B (LWP3 GoToAbsolutePosition 0x0D) to the mapped encoder angle.`

### Speed Calibration, Control & Realistic Braking
- **VC-07:** `WHEN setSpeed(targetMps) is called, THE VehicleDriver SHALL map m/s to LWP3 Port A speed percentage [-100, +100] using Tire Ø = 71.6mm and empirical kCal (inverted for Port A CCW forward).`
- **VC-08:** `WHEN startSpeedCalRun() is triggered, THE VehicleDriver SHALL drive a fixed encoder revolution target and stop; WHEN saveSpeedCal(measuredMeters) is called, IT SHALL compute and persist kCal in localStorage keyed by hubId.`
- **VC-09:** `WHEN brake(intensity) is called with [0.0, 1.0], THE VehicleDriver SHALL ramp speed down at 20 Hz along a smooth deceleration curve (a = intensity * aMax) and engage LWP3 hold-brake (127) only when |speed| < 0.05 m/s.`

### Hardware Fail-Safe & Watchdog
- **VC-10:** `WHEN BLE disconnects (gattserverdisconnected) or telemetry lags > 200ms while driving, THE VehicleDriver SHALL transition to EMERGENCY_STOP and cut motor power to 0.`
- **VC-11:** `WHEN emergencyStop() is called, THE VehicleDriver SHALL immediately command brake/coast (power = 0) on Ports A and B; WHEN resetEmergencyStop() is called while BLE is connected, IT SHALL return to READY.`

---

## 3. Verification Plan
1. **Unit / Mock Tests (`tests/*.test.ts`):** Verify LWP3 byte packet encoding/decoding, state transitions (`VC-01`..`VC-11`), steering clamp math, 2-step `kCal` calibration, progressive braking, and `> 200ms` watchdog using `MockHubAdapter`.
2. **Bench & Floor Tests:** Verify via the Mobile Web App ([`docs/specs/mobile-web-ui.md`](mobile-web-ui.md)) on Android Chrome with the physical `TechnicHub 88012`.
