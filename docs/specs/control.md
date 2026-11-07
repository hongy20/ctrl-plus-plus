# Domain Spec: Vehicle Control & LEGO Wireless Protocol (`control`)

- **Status:** Approved v3.0 (WebBLE LEGO Wireless Protocol Transport, Runtime Control State Machine & Safety Watchdog)
- **Dependencies:** Consumes active `HubProfile` (ports, `tireDiameterMm`, `kCal`, steering limits, brake tuning) from [`docs/specs/storage.md`](storage.md)
- **Stack:** TypeScript (`navigator.bluetooth`, LEGO Wireless Protocol Service `00001623-1212-efde-1623-785feabcd123`, `vitest`)

---

## 1. State Machine

```text
[DISCONNECTED] ──connect()──► [CONNECTING] ──BLE + Profile ready──► [READY / DRIVING] ◄─┐
      ▲                                                               │   ▲    │        │
      │                                              resetEStop()─────┼───┘    ├────────┘
      │                                                               ▼        ▼  [CALIBRATING]
      └──disconnect()── [EMERGENCY_STOP] ◄────fault / e-stop──────────┴────────┘  (locks drive)
```

---

## 2. EARS Behavioral Requirements

### BLE Transport, Hub Discovery & Telemetry (LEGO Wireless Protocol)
- **CTL-01:** `WHEN connect() is invoked, THE WebBleHubAdapter SHALL open the browser Web Bluetooth chooser filtered by LEGO Wireless Protocol service UUID (00001623-1212-efde-1623-785feabcd123) and connect to the GATT characteristic (00001624-1212-efde-1623-785feabcd123).`
- **CTL-02:** `WHEN connected, THE VehicleDriver SHALL set the Hub LED (Port 0x32) to Cyan, query all LEGO Wireless Protocol Hub Properties (0x01..0x0D including MAC Address 0x0D, FW/HW versions, RSSI, Battery Type), subscribe to Port A/B encoders (>= 10 Hz), Hub Temperature (Port 0x3D), and Battery Level (Property 0x06), log Attached I/O ports (0x04), support renaming the Hub in flash via setHubName() (Property 0x01), load the HubProfile (STR-01), and enter READY.`

### Calibration Interlock State
- **CTL-03:** `WHILE in the CALIBRATING state, THE VehicleDriver SHALL reject standard teleop setSpeed() and setSteering() calls so calibration routines (CAL-01..CAL-03) have exclusive actuator control.`

### Runtime Steering, Speed & Progressive Braking
- **CTL-04:** `WHEN setSteering(angleNorm) is called with [-1.0, +1.0] in READY/DRIVING, THE VehicleDriver SHALL map angleNorm to the active HubProfile's clamped [leftLimit, rightLimit] around centerPos and command the steer port (LEGO Wireless Protocol GoToAbsolutePosition 0x0D).`
- **CTL-05:** `WHEN setSpeed(targetMps) is called in READY/DRIVING, THE VehicleDriver SHALL map m/s to drive port speed percentage [-100, +100] using the active HubProfile's tireDiameterMm, kCal, and drivePolarity.`
- **CTL-06:** `WHEN brake(intensity?) is called in READY/DRIVING (defaulting to HubProfile.defaultBrakeIntensity), THE VehicleDriver SHALL ramp speed down at 20 Hz along a smooth deceleration curve (a = intensity * aMax) and engage motor hold-brake (127) only when |speed| < 0.05 m/s.`

### Hardware Fail-Safe & Watchdog
- **CTL-07:** `WHEN BLE disconnects (gattserverdisconnected) or telemetry lags > 200ms while driving or calibrating, THE VehicleDriver SHALL immediately transition to EMERGENCY_STOP and cut motor power to 0.`
- **CTL-08:** `WHEN emergencyStop() is called from any state, THE VehicleDriver SHALL immediately command brake/coast (power = 0) on all drive/steer ports and enter EMERGENCY_STOP; WHEN resetEmergencyStop() is called while BLE is connected, IT SHALL return to READY.`

---

## 3. Verification Plan
1. **Unit / Mock Tests (`tests/control.test.ts`):** Verify LEGO Wireless Protocol byte packet encoding/decoding, state transitions (`CTL-01`..`CTL-08`), `CALIBRATING` teleop lock (`CTL-03`), steering/speed mapping from `HubProfile`, progressive braking ramp, and `> 200ms` watchdog using `MockHubAdapter`.
2. **Bench & Floor Tests:** Verify via the Mobile Web App ([`docs/specs/ui.md`](ui.md)) on Android Chrome with the physical `TechnicHub 88012`.
