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

## 4. Milestones (Incremental Spec Slices)

- **Milestone 1: Vehicle Control & Speed Calibration**
  - BLE discovery and connection to Lego Hub.
  - Steering limit calibration (left/center/right auto-homing) and drive speed calibration.
  - Dead-man switch / emergency stop on connection drop or keyboard override.
- **Milestone 2: Sensor Pod & Obstacle Avoidance**
  - Micro-board firmware streaming camera and/or distance telemetry over Wi-Fi.
  - Safety reflex layer: automatic proportional slowdown and emergency stop when obstacles breach threshold distance.
- **Milestone 3: Vision & Target Following**
  - Real-time object/person detection on live video stream.
  - PID control loop keeping target centered in frame (steering) and at a target bounding-box distance (speed).

---

## 5. Open Questions & TBDs (To Be Resolved Before Milestone 1 Spec Freeze)

- [ ] **TBD-1 (Lego Car Model & Hub Type):** Which specific Lego Technic set / Hub model is used (e.g., 4-port Technic Hub `88012`), and which ports are connected to Drive vs. Steering motors?
- [ ] **TBD-2 (Micro-Board & Sensor Selection):** Which micro-board (e.g., ESP32-CAM, XIAO ESP32S3 Sense, or Raspberry Pi Zero 2W) and range sensor (e.g., VL53L1X ToF laser vs. HC-SR04 ultrasonic) will we use?
- [ ] **TBD-3 (Host Language & Stack):** Confirm primary language for the Off-board Brain on Mac (Recommended: Python 3.11+ with `bleak` / `pylgbst` + `opencv` / `ultralytics`).
- [ ] **TBD-4 (Speed Calibration Method):** How should physical ground speed (`m/s`) be calibrated against motor power/encoder ticks (e.g., timed 1-meter straight-line run using motor encoders vs. visual markers)?
