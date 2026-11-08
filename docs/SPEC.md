# `Ctrl++` — Living System Specification

- **Status:** v0.3 (Serverless React SPA + Offline PWA Architecture)
- **Last Updated:** 2026-11-07

---

## 1. Overview & Vision

`Ctrl++` adds autonomous driving capabilities on top of a **stock Lego Technic RC car** without cutting wires or modifying the stock Lego drivetrain. By combining the stock Lego Bluetooth Low Energy (BLE) Hub with an attachable wireless camera/sensor micro-board and a **100% client-side Mobile Web App (PWA)**, the car gains:
1. **Calibrated Speed & Steering Control** (closed-loop control & manual override)
2. **Environment Awareness & Obstacle Avoidance** (automatic braking / evasive steering)
3. **Visual Target Following** (tracking and following a target such as a person)

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                STOCK LEGO RC CAR                        │
│                                                         │
│  ┌─────────────────────────┐  ┌──────────────────────┐  │
│  │  Lego Control+ BLE Hub  │  │  Micro-Board Pod     │  │
│  │  - Drive Motor (Speed)  │  │  - Camera Stream     │  │
│  │  - Steer Motor (Angle)  │  │  - Distance Sensor   │  │
│  │  - Internal IMU / Tilt  │  └──────────┬───────────┘  │
│  └────────────▲────────────┘             │              │
└───────────────┼──────────────────────────┼──────────────┘
                │ Web Bluetooth (LEGO Wireless Protocol) │ Wi-Fi (WS / MJPEG)
                ▼                                        ▼
┌─────────────────────────────────────────────────────────┐
│       REACT SPA / OFFLINE PWA (Android Chrome)          │
│  - Shared VehicleDriver Singleton + Persistent E-STOP   │
│  - Views: Connect • Calibrate • Debug • Drive • Vision  │
│  - In-Browser Vision (WebGPU/MediaPipe) & Safety Loop   │
└─────────────────────────────────────────────────────────┘
```

### Component Boundaries
1. **Vehicle Actuation Subsystem (Lego Control+ / Powered Up BLE Hub):**
   - Receives drive speed and steering angle commands over BLE (LEGO Wireless Protocol Service `00001623-1212-efde-1623-785feabcd123`).
   - Emits motor encoder telemetry, battery status, and hub IMU (tilt/gyro/accel) readings.
2. **On-Vehicle Perception Pod (Attachable Micro-Board + Sensors):**
   - Mounted non-destructively onto the Lego chassis with its own lightweight battery.
   - Streams live video frames and distance/proximity readings over Wi-Fi directly to the browser.
3. **Browser Brain (React SPA + Offline PWA on Android Chrome):**
   - Connects directly to the Lego BLE Hub via Web Bluetooth API (`navigator.bluetooth`)—no MacBook required after initial PWA install.
   - Client-side view switching preserves the active WebBLE connection across Connect, Calibrate, Debug, and Drive screens.

---

## 3. Architectural Decision Records (ADRs)

| ID | Decision | Rationale | Status |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Support **LEGO Powered Up / Control+ BLE Hubs** via LEGO Wireless Protocol | Avoids custom motor drivers or hardware modification; communicates via standard LEGO Wireless Protocol GATT service and reads built-in motor encoders & IMU. | ✅ Locked |
| **ADR-002** | **React + TypeScript SPA & Offline PWA** via Web Bluetooth | Client-side navigation keeps WebBLE alive across screens; `vite-plugin-pwa` caches the app on Android so no MacBook or public server is needed. | ✅ Locked |
| **ADR-003** | Simulation / Mock-first interfaces | Hardware testing is slow; strict TypeScript contracts (`HubAdapter`, `VehicleDriver`) allow testing LEGO Wireless Protocol packet encoding and control loops in `vitest`. | ✅ Locked |

---

## 4. Milestones & Subsystem Specs (Created Just-in-Time)

| Milestone | Domain Spec | Scope |
| :--- | :--- | :--- |
| **M1: Vehicle Control & Calibration** | [`profile.md`](specs/profile.md), [`storage.md`](specs/storage.md), [`calibration.md`](specs/calibration.md), [`control.md`](specs/control.md), [`ui.md`](specs/ui.md), [`tech.md`](specs/tech.md) | Official LEGO set profiles, per-hub storage, steering/speed calibration, LEGO Wireless Protocol BLE control & progressive braking, React SPA shell, CI/CD & GitHub Pages |
| **M2: Mobile Cockpit UI & Teleop** | [`ui.md`](specs/ui.md) | `Drive` view: touch & device-tilt steering/throttle HUD, live telemetry gauges |
| **M3: Autonomous Driving Maneuvers** | `maneuvers.md` *(future)* | Parallel parking, 3-point turn & skills via wheel encoders + Hub IMU |
| **M4: Sensor Pod & Obstacle Avoidance** | `sensor.md` *(future)* | Wi-Fi camera/distance stream to browser, reflex braking layer |
| **M5: Vision & Target Following** | `vision.md` *(future)* | In-browser object/person tracking (MediaPipe/WebGPU), closed-loop PID following |

---

## 5. Locked Hardware & Stack Decisions (Formerly TBDs)
- [x] **TBD-1 (Supported Vehicles & Reference Rig):** Any LEGO vehicle with a **Powered Up / Control+ Hub** via [`docs/specs/profile.md`](specs/profile.md); primary test/debug vehicle is **42124 Off-Road Buggy** (`TechnicHub 88012`, Tire Ø `71.6mm`, Port A Drive CCW, Port B Steer).
- [x] **TBD-3 (Stack & Hosting):** **React 19 + TypeScript + Tailwind CSS + Vite** (`dist/` git-ignored), `@vitejs/plugin-basic-ssl` + `vite-plugin-pwa`, hosted on **GitHub Pages** (`https://hongy20.github.io/ctrl-plus-plus/`), `vitest` for tests.
- [x] **TBD-4 (Speed Calibration):** Encoder `deg/s` + wheel circumference + `k_cal` correction factor verified via 1-meter floor run.
- [ ] **TBD-2 (Micro-Board & Sensor Selection — Deferred to M4):** Select Wi-Fi camera/sensor board and range sensor before Milestone 4.
