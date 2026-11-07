# 🏎️ lego-autopilot

Browser-based autopilot for a stock **LEGO Technic 42124 Off-Road Buggy**—using **Web Bluetooth (LWP3)** for direct motor/steering control, an attachable Wi-Fi camera/sensor pod, and in-browser vision. **No backend server or hardware modification required.**

```
[LEGO 42124 Hub (Port A Drive, Port B Steer)] ──WebBLE (LWP3)──► [Browser Web App (Android / Desktop Chrome)]
[Attachable Camera + Distance Pod]            ──Wi-Fi Stream───► [Calibration • Teleop • Maneuvers • Vision]
```

## 🛠️ Hardware & Requirements
- **Vehicle:** Stock LEGO Technic **42124 Off-Road Buggy** (`TechnicHub 88012`, Tire Ø `71.6mm`, Port A = Drive CCW, Port B = Steering)
- **Browser:** **Android Chrome** or **Desktop Chrome / Edge** (native Web Bluetooth `navigator.bluetooth`)
- **Sensor Pod (M4):** Wireless camera + ToF distance board (`TBD` in [`docs/SPEC.md`](docs/SPEC.md))

## 🚀 Quick Start
```bash
npm install
npm test          # Run Vitest unit & mock-hub tests
npm run dev       # Start Vite web app
```
1. Turn on the LEGO Technic Hub (blinking light; do not open the LEGO app).
2. Open the web app in Chrome, tap **Connect Hub**, and run **Steering & 1m Speed Calibration**.

## 🗺️ Milestones
- [ ] **M1: Vehicle Control & Calibration** ([`docs/specs/vehicle-control.md`](docs/specs/vehicle-control.md)) — WebBLE LWP3 driver, auto-homing steering, 1m speed calibration, progressive braking, Web Debug Panel
- [ ] **M2: Mobile Cockpit UI & Teleop** — Touch & tilt steering/throttle HUD, live telemetry, E-STOP
- [ ] **M3: Autonomous Driving Maneuvers** — Parallel parking & 3-point turns via wheel encoders + Hub IMU
- [ ] **M4: Sensor Pod & Obstacle Avoidance** — Wi-Fi sensor stream + reflex braking
- [ ] **M5: Vision & Target Following** — In-browser tracking (MediaPipe/WebGPU) + PID following

## 🧠 Spec-Driven Development (SDD)
This project uses layered, low-bloat specs (see [`AGENTS.md`](AGENTS.md)):
- [`docs/SPEC.md`](docs/SPEC.md) — System map, ADRs, and global `TBD`s (≤ 80 lines)
- [`docs/STATUS.md`](docs/STATUS.md) — Active milestone and session handoff (≤ 30 lines)
- `docs/specs/<domain>.md` — Per-milestone state machines & EARS rules (≤ 80 lines)
- `docs/plans/<milestone>.md` — Disposable TDD task checklists
