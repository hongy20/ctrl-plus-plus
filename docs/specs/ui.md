# Domain Spec: Mobile Web App Shell, Lifecycle & Views (`ui`)

- **Status:** Approved v1.1 (M1 Shell, Connect->Calibrate Onboarding & Debug Views; M2 Cockpit Pending)
- **Stack:** React 19 + TypeScript + Tailwind CSS + Vite (`vite-plugin-pwa`, `@vitejs/plugin-basic-ssl`, Screen Wake Lock API, Page Visibility API)

---

## 1. Navigation & Lifecycle Flow

```text
[App Mounted] ──► Request Screen Wake Lock (UI-02)
      │
      ├──► Persistent Top Bar: [BLE Status] + [Battery %] + [Temp °C] + [E-STOP / Resume] (UI-01)
      ├──► Client-Side Views:  [Connect] ──("Tweak / Calibrate")──► [Calibrate] ◄──► [Debug] (M1)
      │
      └──► On visibilityState === 'hidden' / pagehide:
           emergencyStop() ──► disconnect() (BLE GATT close) (UI-03)
```

---

## 2. EARS Behavioral Requirements

### SPA Shell & Global Safety Header
- **UI-01:** `WHILE navigating between SPA tabs (Connect, Calibrate, Debug, Drive) without a browser page reload, THE App SHALL preserve the shared VehicleDriver singleton and keep the global connection badge, Hub Battery % (< 20% warning), Hub Temperature (°C), and E-STOP / Resume button pinned in the top header.`

### Mobile Device Lifecycle & Power Management
- **UI-02:** `WHILE the web app is visible in the foreground, THE App SHALL request and hold a Screen Wake Lock (navigator.wakeLock.request('screen')) and re-acquire it on visibility restore so the mobile screen never dims or sleeps during operation.`
- **UI-03:** `WHEN the page leaves the foreground or unloads (document.visibilityState === 'hidden' or pagehide), THE App SHALL synchronously invoke emergencyStop() and disconnect() so the LEGO Hub hardware fail-safe engages immediately.`

### M1 Views (`Connect`, `Calibrate`, `Debug`)
- **UI-04:** `WHILE on the Connect tab, THE UI SHALL (a) provide WebBLE connection controls and inline Hub Name editing (CTL-02), (b) upon connection, display the loaded HubProfile (STR-01: LEGO Set preset, steering/speed calibration status, wheel Ø, brake intensity) with a "Tweak / Calibrate" CTA that navigates directly to the Calibrate tab, and (c) list Remembered Hubs from localStorage with Forget Hub and Reset Calibration actions (STR-04).`
- **UI-05:** `WHILE on the Calibrate tab, THE UI SHALL provide controls to (a) select the Official Vehicle Profile preset (PRF-01, default: "42124 Off-Road Buggy"), (b) run Auto-Calibrate Steering Limits (CAL-01) and 2-Step 1m Speed Calibration (CAL-03), and (c) manually tweak per-hub parameters (STR-03: Wheel Diameter mm, Steering Clamp %, Default Brake Intensity).`
- **UI-06:** `WHILE on the Debug tab, THE UI SHALL provide touch controls for Forward/Reverse speed presets, Steer Left/Center/Right slider, Progressive Brake button, live Port A/B encoder telemetry, and a live inspector log of all LEGO Wireless Protocol Hub Properties and Attached I/O ports.`

### M2 Views (`Drive` Cockpit — Planned for Milestone 2)
- *To be specified in Milestone 2: Device-orientation (tilt) steering/throttle HUD and dual-thumb touch pedals.*

---

## 3. Verification Plan
1. **Unit / Component Tests (`tests/ui.test.ts`):** Verify Screen Wake Lock acquisition/re-acquisition (`UI-02`), synchronous `emergencyStop() + disconnect()` on `visibilitychange` (`hidden`) / `pagehide` (`UI-03`), and Connect → **Tweak / Calibrate** navigation preserving `VehicleDriver` state (`UI-01`, `UI-04`, `UI-05`).
2. **Android Chrome PWA Test:** Verify offline PWA install, screen stays awake while idle, switching tabs keeps BLE connected, and locking/backgrounding the phone immediately disconnects BLE and stops the car.
