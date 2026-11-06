# `lego-autopilot` — Living System Specification

- **Status:** Draft v0.1 (Phase 1 Discovery & Architecture Baseline)
- **Last Updated:** 2026-11-06

---

## 1. Overview & Vision

`lego-autopilot` adds autonomous driving capabilities on top of a **stock Lego Technic RC car** without cutting wires or modifying the stock Lego drivetrain. By combining the stock Lego Bluetooth Low Energy (BLE) Hub with an attachable wireless camera/sensor micro-board and an off-board compute brain (Mac), the car gains:
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
                │ Bluetooth (BLE / LWP3)   │ Wi-Fi (HTTP/WS/UDP)
                ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│                 OFF-BOARD BRAIN (Mac)                   │
│  - Perception Engine (Obstacle & Target Detection)      │
│  - Speed Calibration & Control Loop (PID / Safety Stop) │
│  - Manual Override & Telemetry Dashboard                │
└─────────────────────────────────────────────────────────┘
```

### Component Boundaries
1. **Vehicle Actuation Subsystem (Lego Control+ / Powered Up BLE Hub):**
   - Receives drive power/speed and steering angle commands over BLE (Lego Wireless Protocol v3).
   - Emits motor encoder telemetry, battery status, and hub IMU (tilt/acceleration) readings.
2. **On-Vehicle Perception Pod (Attachable Micro-Board + Sensors):**
   - Mounted non-destructively onto the Lego chassis with its own lightweight battery.
   - Streams live video frames and distance/proximity sensor readings over Wi-Fi to the Off-board Brain.
3. **Off-Board Brain (Mac Host Application):**
   - Ingests sensor/video streams and hub telemetry.
   - Runs computer vision, sensor fusion, speed calibration, and safety/control loops.
   - Sends real-time actuation commands back to the Lego BLE Hub.

---

## 3. Architectural Decision Records (ADRs)

| ID | Decision | Rationale | Status |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Use stock **Lego Technic Control+ / Powered Up BLE Hub** for motor control | Avoids custom motor drivers or hardware modification; Mac can communicate directly via BLE (LWP3) and read built-in motor encoders & IMU. | ✅ Locked |
| **ADR-002** | **Off-board Brain** architecture (heavy compute runs on Mac) | Keeps weight and power draw on the Lego car minimal; allows running modern CV/AI models at high FPS on Apple Silicon; decouples camera/sensor pod from motor control. | ✅ Locked |
| **ADR-003** | Simulation / Mock-first interfaces | Hardware testing is slow; defining strict interface contracts for `VehicleDriver` and `SensorStream` allows testing control loops with recorded video/mock sensors on Mac. | ✅ Locked |

---

## 4. Milestones & Subsystem Specs (Created Just-in-Time)

| Milestone | Subsystem Spec | Scope |
| :--- | :--- | :--- |
| **M1: Vehicle Control & Calibration** | [`docs/specs/01-vehicle-control.md`](specs/01-vehicle-control.md) | BLE hub, steering/speed calibration, realistic progressive braking |
| **M2: Mobile Web UI & Teleop** | `docs/specs/02-mobile-web-ui.md` *(future)* | Phone web app with device-motion (tilt) steering/throttle, telemetry & e-stop |
| **M3: Autonomous Driving Maneuvers** | `docs/specs/03-driving-maneuvers.md` *(future)* | Parallel parking, 3-point turn & skills via wheel encoders + Hub IMU |
| **M4: Sensor Pod & Obstacle Avoidance** | `docs/specs/04-sensor-pod.md` *(future)* | Wi-Fi camera/distance stream, reflex braking layer |
| **M5: Vision & Target Following** | `docs/specs/05-vision-autonomy.md` *(future)* | Object/person tracking, closed-loop PID following |

---

## 5. Locked Hardware & Stack Decisions (Formerly TBDs)
- [x] **TBD-1 (Lego Car & Ports):** LEGO Technic **42124 Off-Road Buggy** (`TechnicHub 88012`, Tire Ø `71.6mm`; **Port A** = Drive CCW, **Port B** = Steering).
- [x] **TBD-3 (Host Stack & Firmware):** **Python 3.11+** on macOS using `bleak` (LWP3 BLE protocol over stock LEGO firmware).
- [x] **TBD-4 (Speed Calibration):** Encoder `deg/s` + wheel circumference + `k_cal` correction factor verified via 1-meter floor run.
- [ ] **TBD-2 (Micro-Board & Sensor Selection — Deferred to M4):** Select Wi-Fi camera/sensor board and range sensor before Milestone 4.
