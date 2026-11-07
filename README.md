# 🏎️ lego-autopilot

Mobile Web Bluetooth (PWA) autopilot for a stock **LEGO Technic 42124 Off-Road Buggy**—combining direct **WebBLE (LWP3)** motor/steering control, an attachable Wi-Fi camera/sensor pod, and in-browser vision. **No backend server or hardware modification required.**

```
[LEGO 42124 Hub (Port A Drive, Port B Steer)] ──WebBLE (LWP3)──► [React SPA / Offline PWA (Android Chrome)]
[Attachable Camera + Distance Pod]            ──Wi-Fi Stream───► [Connect • Calibrate • Debug • Drive • Vision]
```

## 🛠️ Hardware & Stack
- **Vehicle:** Stock LEGO Technic **42124 Off-Road Buggy** (`TechnicHub 88012`, Tire Ø `71.6mm`, Port A = Drive CCW, Port B = Steering)
- **App Stack:** **React 19 + TypeScript + Tailwind CSS + Vite** (`navigator.bluetooth`, `vite-plugin-pwa` for offline mobile install, `vitest`)
- **Sensor Pod (M4):** Wireless camera + ToF distance board (`TBD` in [`docs/SPEC.md`](docs/SPEC.md))

## 🚀 Quick Start (Local HTTPS + Offline Android PWA)
```bash
npm install
npm test                  # Run Vitest unit & mock-hub tests
npm run dev -- --host     # Serve over local HTTPS for Android Chrome
```
1. Open `https://<mac-ip>:5173` in **Android Chrome** and tap **"Add to Home Screen"** (caches the PWA offline so you can turn off your MacBook).
2. Turn on the LEGO Technic Hub, tap **Connect**, and run **Steering & 1m Speed Calibration**.

## 🗺️ Milestones
- [ ] **M1: Vehicle Control & Calibration** ([`docs/specs/vehicle-control.md`](docs/specs/vehicle-control.md)) — WebBLE LWP3 driver, auto-homing steering, 1m speed calibration, progressive braking, React SPA (`Connect`, `Calibrate`, `Debug`)
- [ ] **M2: Mobile Cockpit UI & Teleop** — `Drive` tab with touch & tilt steering/throttle HUD, live gauges, E-STOP
- [ ] **M3: Autonomous Driving Maneuvers** — Parallel parking & 3-point turns via wheel encoders + Hub IMU
- [ ] **M4: Sensor Pod & Obstacle Avoidance** — Wi-Fi sensor stream + reflex braking
- [ ] **M5: Vision & Target Following** — In-browser tracking (MediaPipe/WebGPU) + PID following

## 🧠 Spec-Driven Development (SDD)
This project uses layered, low-bloat specs (see [`AGENTS.md`](AGENTS.md)):
- [`docs/SPEC.md`](docs/SPEC.md) — System map, ADRs, and global `TBD`s (≤ 80 lines)
- [`docs/STATUS.md`](docs/STATUS.md) — Active milestone and session handoff (≤ 30 lines)
- `docs/specs/<domain>.md` — Per-milestone state machines & EARS rules (≤ 80 lines)
- `docs/plans/<milestone>.md` — Disposable TDD task checklists
