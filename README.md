# 🏎️ lego-autopilot

The official **LEGO Control+** and **Powered Up** apps for the **42124 Off-Road Buggy** offer a frustrating driving experience: the stock touch joystick/sliders lack tactile feedback, holding a steady cruising speed is difficult, and braking is strictly **binary (all-or-nothing)**—lifting your thumb or hitting brake either coasts freely (`Float`) or slams the motor coils/shaft locked (`Brake 127` / `Hold 126`) with an abrupt jerk instead of decelerating like a real car.

`lego-autopilot` replaces the stock app with a direct **Mobile Web Bluetooth** controller and autopilot running right in your phone's browser:
- **Realistic Driving & Progressive Braking:** Tilt your phone to steer, hold calibrated ground speeds (`m/s`), and apply smooth **progressive braking** (`0–100%` deceleration curve before engaging low-speed hold).
- **Automated Driving Tricks:** Execute one-tap stunts and maneuvers like **parallel parking**, **3-point turns**, and **U-turns** using the hub's built-in motor encoders and 6-axis IMU.
- **FPV Camera & Home Racing (Future):** Integrate a lightweight driver-view camera pod to build mixed-reality / FPV living-room racing games inspired by ***Mario Kart Live: Home Circuit***.

## 🛠️ Hardware

- **Stock [LEGO Technic 42124 Off-Road Buggy](https://www.lego.com/en-us/product/off-road-buggy-42124)** (zero hardware or wiring modifications required)

<p align="center">
  <img src="https://cdn.rebrickable.com/media/sets/42124-1.jpg" alt="LEGO Technic 42124 Off-Road Buggy" width="420" />
</p>

## 🚀 Quick Start
```bash
npm install
npm run dev -- --host     # Serve over local HTTPS for Android Chrome
```
1. Open `https://<mac-ip>:5173` in **Android Chrome** and tap **"Add to Home Screen"** (caches the app offline so you don't need a laptop running).
2. Turn on the LEGO Technic Hub, tap **Connect**, and run **Steering & 1m Speed Calibration**.

## 🧠 SDLC (Software Development Life Cycle)

This project adopts **AI-Native Spec-Driven Development (SDD)**—a methodology where structured specifications (not ad-hoc chat prompts or manual coding) are the single source of truth, and a team of AI agents handles the entire engineering lifecycle from spec auditing to TDD implementation and CI verification:

1. **Proactive PM & Just-in-Time EARS Specs:** A **Lead PM Agent** co-designs concise domain specs ([`docs/specs/`](docs/specs/)) using 1-line **EARS (`WHEN ... THE ... SHALL ...`)** rules and state machines right before each milestone, verified by a **Spec-Auditor Sub-Agent**.
2. **Autonomous Sub-Agent TDD Execution:** Once a spec PR is approved, **Implementer** and **Reviewer Sub-Agents** execute atomic Red-Green-Refactor TDD tasks ([`docs/plans/`](docs/plans/)) against mock hardware interfaces (`MockHubAdapter`) before any physical floor run.
3. **Automated CI & Anti-Bloat Gates:** Every PR is gated by GitHub Actions ([`docs/specs/ci-cd.md`](docs/specs/ci-cd.md)) enforcing strict Markdown line caps (`wc -l`), linting (`ESLint` + `tsc`), unit tests (`vitest`), and production builds.
4. **Repo as Persistent Memory:** [`AGENTS.md`](AGENTS.md), [`docs/SPEC.md`](docs/SPEC.md), and [`docs/STATUS.md`](docs/STATUS.md) store all architectural decisions and session handoff state so any AI agent can resume work immediately without context loss.

*In other words, I don't expect to touch any source code from this project.*
