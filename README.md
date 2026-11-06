# 🏎️ lego-autopilot

**AI-powered autopilot for stock Lego Technic RC cars** — combining Bluetooth Low Energy (BLE) motor control, wireless camera & sensor streaming, obstacle avoidance, and visual target following.

---

## 📖 What This Project Is About

`lego-autopilot` brings autonomous driving capabilities to a **stock Lego Technic RC car** without cutting wires or permanently modifying the Lego drivetrain.

Instead of cramming heavy compute onto a small plastic chassis, `lego-autopilot` uses an **Off-Board Brain** architecture:
1. **Actuation (Stock Lego BLE Hub):** The host computer connects directly to the car's stock Lego Control+ / Powered Up Smart Hub over Bluetooth (Lego Wireless Protocol v3) to command drive speed, steering angle, and read built-in motor encoders & IMU telemetry.
2. **Perception (Attachable Micro-Board Pod):** A lightweight, battery-powered microcontroller with a camera and distance sensors clips onto the car and streams live telemetry over Wi-Fi.
3. **Autonomy (Off-Board Brain on Mac):** Runs real-time computer vision, sensor fusion, speed calibration, and closed-loop PID control to steer and throttle the car safely.

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
┌─────────────────────────────────────────────────────────┘
│                 OFF-BOARD BRAIN (Mac)                   │
│  - Perception Engine (Obstacle & Target Detection)      │
│  - Speed Calibration & Control Loop (PID / Safety Stop) │
│  - Manual Override & Telemetry Dashboard                │
└─────────────────────────────────────────────────────────┘
```

### Key Features (Planned)
- **Calibrated Speed & Steering:** Auto-homing steering limits and calibrated ground-speed control (`m/s`).
- **Environment Awareness & Obstacle Avoidance:** Automatic proportional braking and evasive steering when obstacles breach safety thresholds.
- **Visual Target Following:** Real-time person/object tracking to follow a moving target at a safe distance.
- **Simulation & Mock-First Testing:** Ability to test vision and control loops against recorded video and simulated BLE hubs before running on physical hardware.

---

## 🧠 Development Process: AI-Native Spec-Driven Development (SDD)

This repository is built end-to-end using **Modern Agentic Spec-Driven Development (SDD)**. Rather than writing ad-hoc code via unstructured chat prompts ("vibe coding"), **the specification is the single source of truth**, and the repository itself acts as persistent memory across AI coding sessions.

### The 5-Phase SDD Loop
1. **Phase 1: Discovery & Scoping** — Define physical constraints, hardware boundaries, and explicit `TBD`s.
2. **Phase 2: The Living Spec ([`docs/SPEC.md`](docs/SPEC.md))** — Lock down data models, network/BLE contracts, state machines, and safety edge cases *before* writing implementation code.
3. **Phase 3: Test & Verification Plan** — Translate acceptance criteria into verifiable checks (mock/simulator tests first, hardware-in-the-loop second).
4. **Phase 4: Task Breakdown (`docs/PLAN.md`)** — Slice each milestone into small, atomic, testable implementation steps.
5. **Phase 5: Agentic Execution Loop** — Implement code to satisfy the spec and tests; update [`docs/SPEC.md`](docs/SPEC.md) and [`docs/STATUS.md`](docs/STATUS.md) continuously.

### Resuming Work in Any AI Agent Session
Because context is stored in versioned Markdown files rather than chat history, you can switch AI agents or start a fresh chat anytime:
> **Prompt:** *"Read `AGENTS.md` and let's continue."*

---

## 📂 File & Folder Structure

```text
lego-autopilot/
├── AGENTS.md              # AI agent rules & anti-bloat guardrails
├── README.md              # Project overview & setup guide
├── docs/
│   ├── SPEC.md            # High-level System Map, ADRs & global TBDs (≤80 lines)
│   ├── STATUS.md          # Cross-session handoff state (≤30 lines)
│   ├── specs/             # Per-milestone EARS specs (≤80 lines each, created just-in-time)
│   └── plans/             # Disposable TDD task checklists
├── src/                   # (Upcoming) Off-board Brain host application
├── firmware/              # (Upcoming) Micro-board streaming firmware
└── tests/                 # (Upcoming) Unit & mock-hardware tests
```

---

## 🛠️ Hardware Requirements

| Subsystem | Component | Status / Notes |
| :--- | :--- | :--- |
| **Base Vehicle** | Stock Lego Technic RC Car with **Control+ / Powered Up BLE Hub** | Exact Lego set & motor port mapping: **`TBD`** (see [`docs/SPEC.md`](docs/SPEC.md)) |
| **Off-Board Brain** | Mac (Apple Silicon recommended) with Bluetooth Low Energy & Wi-Fi | Runs perception models, PID control loop, and BLE central client |
| **Camera & Sensor Pod** | Wireless microcontroller + camera + distance sensor + small LiPo/USB battery | Specific board (e.g., ESP32S3 Sense / Pi Zero 2W) & ToF/Ultrasonic sensor: **`TBD`** |

---

## 🚀 Getting Started / How to Run (`TBD`)

> [!NOTE]
> Implementation begins once **Milestone 1 (Vehicle Control & Speed Calibration)** specifications are finalized in [`docs/SPEC.md`](docs/SPEC.md).

### 1. Prerequisites (`TBD`)
- Host OS: macOS with Bluetooth enabled
- Runtime & dependencies: `TBD` (e.g., Python 3.11+ / `uv` or `venv`)

### 2. Installation (`TBD`)
```bash
# Clone the repository
git clone https://github.com/hongy20/lego-autopilot.git
cd lego-autopilot

# Environment setup commands will be added in Milestone 1
```

### 3. Hardware Pairing & Calibration (`TBD`)
- Turn on the Lego Technic BLE Hub (do not connect the phone app).
- Run the discovery & steering/speed calibration routine (`TBD`).

### 4. Starting the Autopilot (`TBD`)
- Commands for **Mock/Simulation Mode**, **Manual Teleop Mode**, and **Autonomous Mode** will be documented here as each milestone is completed.

---

## 🗺️ Roadmap & Milestones

- [x] **Phase 1 & 2: Architecture Baseline & Hardware Discovery**
- [ ] **Milestone 1: Vehicle Control & Speed Calibration** *(Active)*
  - BLE hub connection, steering limit auto-homing, speed calibration, realistic progressive braking, and CLI debug controls.
- [ ] **Milestone 2: Mobile Web UI & Teleop Dashboard**
  - Local Wi-Fi web UI for mobile phone control with device-motion (tilt) steering/throttle, live telemetry, and emergency stop.
- [ ] **Milestone 3: Autonomous Driving Maneuvers**
  - Parallel parking, 3-point turn, and precision driving skills using motor encoders + Hub IMU.
- [ ] **Milestone 4: Sensor Pod & Obstacle Avoidance**
  - Micro-board Wi-Fi telemetry stream and reflex braking/steering layer.
- [ ] **Milestone 5: Vision & Target Following**
  - Live camera object/person tracking and closed-loop PID following.

---

## 🛡️ Safety & Fail-Safe Principles

Because this software controls a physical moving vehicle, every milestone enforces three safety invariants:
1. **Dead-Man Switch:** If BLE or Wi-Fi telemetry drops or lags beyond a strict timeout threshold, the car immediately cuts motor power.
2. **Instant Manual Override:** A single keypress (`SPACE` / `ESC`) on the host immediately overrides autonomous control and brakes the vehicle.
3. **Bench Testing First:** New control algorithms must pass simulated tests and "wheels-off-the-ground" bench tests before floor trials.
