# `lego-autopilot` — Living System Specification

- **Status:** v0.2 (Serverless Web Bluetooth Architecture)
- **Last Updated:** 2026-11-07

---

## 1. Overview & Vision

`lego-autopilot` adds autonomous driving capabilities on top of a **stock Lego Technic RC car** without cutting wires or modifying the stock Lego drivetrain. By combining the stock Lego Bluetooth Low Energy (BLE) Hub with an attachable wireless camera/sensor micro-board and a **100% browser-based Web App** (running on an Android phone or laptop browser), the car gains:
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
                │ Web Bluetooth (LWP3)     │ Wi-Fi (WS / MJPEG)
                ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│        BROWSER WEB APP (Android Chrome / Desktop)       │
│  - LWP3 WebBLE Driver & Speed/Steering Calibration      │
│  - Mobile Touch/Tilt Teleop & Autonomous Maneuvers      │
│  - In-Browser Vision (WebGPU/MediaPipe) & Safety Loop   │
└─────────────────────────────────────────────────────────┘
```

### Component Boundaries
1. **Vehicle Actuation Subsystem (Lego Control+ / Powered Up BLE Hub):**
   - Receives drive speed and steering angle commands over BLE (Lego Wireless Protocol v3, Service `00001623-1212-efde-1623-785feabcd123`).
   - Emits motor encoder telemetry, battery status, and hub IMU (tilt/gyro/accel) readings.
2. **On-Vehicle Perception Pod (Attachable Micro-Board + Sensors):**
   - Mounted non-destructively onto the Lego chassis with its own lightweight battery.
   - Streams live video frames and distance/proximity readings over Wi-Fi directly to the browser.
3. **Browser Brain (Static Web App on Phone / Laptop):**
   - Connects directly to the Lego BLE Hub via Web Bluetooth API (`navigator.bluetooth`)—no MacBook or backend server required.
   - Runs calibration (`localStorage`), control loops, autonomous maneuvers, and in-browser vision.

---

## 3. Architectural Decision Records (ADRs)

| ID | Decision | Rationale | Status |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Use stock **Lego Technic Control+ BLE Hub** (`88012`) for motor control | Avoids custom motor drivers or hardware modification; communicates via standard LWP3 GATT service and reads built-in motor encoders & IMU. | ✅ Locked |
| **ADR-002** | **100% Browser Web App** via Web Bluetooth (`navigator.bluetooth`) | Eliminates running a MacBook/Node.js server; Android Chrome & desktop Chrome connect directly to the Hub over WebBLE and host the UI + control loops. | ✅ Locked |
| **ADR-003** | Simulation / Mock-first interfaces | Hardware testing is slow; strict TypeScript contracts (`HubAdapter`, `VehicleDriver`) allow testing LWP3 packet encoding and control loops in `vitest`. | ✅ Locked |

---

## 4. Milestones & Subsystem Specs (Created Just-in-Time)

| Milestone | Domain Spec | Scope |
| :--- | :--- | :--- |
| **M1: Vehicle Control & Calibration** | [`docs/specs/vehicle-control.md`](specs/vehicle-control.md) | Direct WebBLE LWP3 driver, steering/speed calibration, progressive braking, Web Debug Panel |
| **M2: Mobile Cockpit UI & Teleop** | `docs/specs/mobile-web-ui.md` *(future)* | Mobile touch & device-tilt steering/throttle HUD, live telemetry & e-stop |
| **M3: Autonomous Driving Maneuvers** | `docs/specs/driving-maneuvers.md` *(future)* | Parallel parking, 3-point turn & skills via wheel encoders + Hub IMU |
| **M4: Sensor Pod & Obstacle Avoidance** | `docs/specs/sensor-pod.md` *(future)* | Wi-Fi camera/distance stream to browser, reflex braking layer |
| **M5: Vision & Target Following** | `docs/specs/vision-autonomy.md` *(future)* | In-browser object/person tracking (MediaPipe/WebGPU), closed-loop PID following |

---

## 5. Locked Hardware & Stack Decisions (Formerly TBDs)
- [x] **TBD-1 (Lego Car & Ports):** LEGO Technic **42124 Off-Road Buggy** (`TechnicHub 88012`, Tire Ø `71.6mm`; **Port A** = Drive CCW, **Port B** = Steering).
- [x] **TBD-3 (Stack):** **100% TypeScript + Vite Web App** using Web Bluetooth API (raw LWP3 GATT packets), `localStorage` config, `vitest` for tests, and MediaPipe/WebGPU for M5 vision.
- [x] **TBD-4 (Speed Calibration):** Encoder `deg/s` + wheel circumference + `k_cal` correction factor verified via 1-meter floor run.
- [ ] **TBD-2 (Micro-Board & Sensor Selection — Deferred to M4):** Select Wi-Fi camera/sensor board and range sensor before Milestone 4.
