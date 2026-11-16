# Domain Spec: Mobile Web App Shell, Lifecycle & Views (`ui`)

- **Status:** Approved v2.0 (M1 Shell + M2 `Drive` Cockpit HUD: Touch, Cruise Hold, Tilt & Progressive Brake)
- **Stack:** React 19 + TypeScript + Tailwind CSS + Vite (`vite-plugin-pwa`, `@vitejs/plugin-basic-ssl`, Screen Wake Lock API, Page Visibility API, DeviceOrientation API)

---

## 1. Navigation & Lifecycle Flow

```text
[App Mounted] ──► Request Screen Wake Lock (UI-02)
      │
      ├──► Persistent Top Bar: [BLE Status] + [Battery %] + [Temp °C] + [E-STOP / Resume] (UI-01)
      ├──► Client-Side Views:  [Connect] ◄──► [Calibrate] ◄──► [Drive] ◄──► [Debug]
      │
      └──► On visibilityState === 'hidden' / pagehide:
           emergencyStop() ──► disconnect() (BLE GATT close) (UI-03)
```

---

## 2. Tuning Constants

This table is the only place these values are stated. Code exports each one under this name, and tests reference the name, not the literal.

| Constant | Value | Used by |
| :--- | :--- | :--- |
| `BRAKE_TAP_MAX_MS` | `250` | `UI-13` |
| `BRAKE_TAP_STEP_RATIO` | `0.2` | `UI-13` |
| `TILT_DEADZONE_DEG` | `5` | `UI-12` |
| `TILT_MAX_DEG` | `30` | `UI-12` |

---

## 3. EARS Behavioral Requirements

### SPA Shell & Global Safety Header
- **UI-01:** `WHILE navigating between SPA tabs (Connect, Calibrate, Drive, Debug) without a browser page reload, THE App SHALL preserve the shared VehicleDriver singleton and keep the global connection badge with the active Hub's nickname and ledColor swatch, Hub Battery % (< 20% warning), Hub Temperature (°C), and E-STOP / Resume button pinned in the top header.`

### Mobile Device Lifecycle & Power Management
- **UI-02:** `WHILE the web app is visible in the foreground, THE App SHALL request and hold a Screen Wake Lock (navigator.wakeLock.request('screen')) and re-acquire it on visibility restore so the mobile screen never dims or sleeps during operation.`
- **UI-03:** `WHEN the page leaves the foreground or unloads (document.visibilityState === 'hidden' or pagehide), THE App SHALL synchronously invoke emergencyStop() and disconnect() so the LEGO Hub hardware fail-safe engages immediately.`

### M1 Views (`Connect`, `Calibrate`, `Debug`)
- **UI-04:** `WHILE on the Connect tab, THE UI SHALL (a) provide WebBLE connection controls, inline Hub nickname editing, and an LED color picker (STR-03) that immediately re-commands the Hub LED (CTL-09 volatile), (b) upon connection, display the loaded HubProfile (STR-01: LEGO Set preset, steering/speed calibration status, wheel Ø, brake intensity) with a "Tweak / Calibrate" CTA that navigates directly to the Calibrate tab, and (c) list Remembered Hubs from localStorage with Forget Hub and Reset Calibration actions (STR-04).`
- **UI-05:** `WHILE on the Calibrate tab, THE UI SHALL provide controls to (a) select the Official Vehicle Profile preset (PRF-01, default: "42124 Off-Road Buggy"), (b) run Auto-Calibrate Steering Limits (CAL-01) and 2-Step 1m Speed Calibration (CAL-03), and (c) manually tweak per-hub parameters (STR-03: Wheel Diameter mm, Steering Clamp %, Default Brake Intensity).`
- **UI-06:** `WHILE on the Debug tab, THE UI SHALL provide touch controls for Forward/Reverse speed presets, Steer Left/Center/Right slider, Progressive Brake button, live drive/steer encoder telemetry, and a live inspector log of all LEGO Wireless Protocol Hub Properties and Attached I/O ports.`
- **UI-07:** `WHEN the browser environment lacks Web Bluetooth support (navigator.bluetooth is undefined or unavailable), THE UI SHALL display a prominent compatibility warning banner on the Connect view advising the user to open the app in Google Chrome (Android or Desktop) over HTTPS and disable the Connect button.`
- **UI-08:** `WHILE Hub Battery Level is below LOW_BATTERY_CUTOFF_PCT, THE UI SHALL display a prominent low-battery cutoff message and disable driving and calibration controls.`

### M2 View (`Drive` Cockpit HUD)
- **UI-09:** `WHILE on the Drive tab, THE UI SHALL display live cockpit gauges for Speed in m/s (computed from drive encoder speedDegPerSec, tireDiameterMm, and kCal), target Throttle % (-100%..+100%), and Steering angle (-100%..+100% and encoder degrees), and disable driving inputs unless VehicleDriver is in READY or DRIVING and battery is above LOW_BATTERY_CUTOFF_PCT.`
- **UI-10:** `WHILE in Touch input mode on the Drive tab, THE UI SHALL provide a horizontal spring-return thumb steering slider/wheel (-100%..+100% that snaps back to 0 on pointer release) and a vertical throttle slider (-100%..+100% mapped to setSpeed(targetMps)).`
- **UI-11:** `WHEN Cruise / Speed Hold is OFF in Touch mode, releasing the throttle slider SHALL smoothly ramp speed to 0 via brake(); WHEN Cruise / Speed Hold is ON, releasing the throttle slider SHALL maintain the selected target speed until adjusted or braked.`
- **UI-12:** `WHEN Tilt input mode is toggled ON on the Drive tab, THE UI SHALL capture the initial device orientation (beta, gamma) as the neutral zero baseline, map pitch/roll outside ±TILT_DEADZONE_DEG up to ±TILT_MAX_DEG to throttle and steering [-1.0, +1.0], and immediately command brake() + center steering when Tilt mode is toggled OFF.`
- **UI-13:** `WHEN the Brake button on the Drive tab is tapped (< BRAKE_TAP_MAX_MS), THE UI SHALL step the active target speed toward 0 by BRAKE_TAP_STEP_RATIO of max speed and smoothly ramp to that lower target speed via CTL-06; WHEN the Brake button is pressed and held (>= BRAKE_TAP_MAX_MS), THE UI SHALL smoothly ramp speed all the way to 0 and engage hold-brake via CTL-06.`

---

## 4. Verification Plan
1. **Unit / Component Tests (`tests/ui.test.ts`, `tests/drive-tab.test.ts`):** Verify Screen Wake Lock (`UI-02`), background disconnect (`UI-03`), M1 views (`UI-04`..`UI-08`), and M2 `Drive` HUD gauges, spring-return vs. Cruise Hold throttle, Tilt baseline/deadzone mapping, and Tap vs. Hold progressive braking (`UI-09`..`UI-13`).
2. **Physical Vehicle Floor Test (`42124 Off-Road Buggy`):** Verify Touch + Cruise Hold, Tilt steering/throttle, and Tap-to-slow vs. Hold-to-stop braking on Android Chrome / desktop Chrome.
