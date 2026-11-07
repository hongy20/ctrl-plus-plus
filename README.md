# 🏎️ lego-autopilot

The official LEGO Control+ app for the **42124 Off-Road Buggy** is very basic and not very engaging—it's hard to maintain a steady speed, there's no progressive braking, and on-screen sliders feel clunky.

`lego-autopilot` replaces the stock app with a direct **Mobile Web Bluetooth** controller and autopilot that runs right in your phone's browser:
- **Intuitive Tilt & Touch Driving:** Tilt your phone to steer, hold steady speeds, reverse, and apply smooth progressive braking.
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
npm test                  # Run unit & mock-hub tests
npm run dev -- --host     # Serve over local HTTPS for Android Chrome
```
1. Open `https://<mac-ip>:5173` in **Android Chrome** and tap **"Add to Home Screen"** (caches the app offline so you don't need a laptop running).
2. Turn on the LEGO Technic Hub, tap **Connect**, and run **Steering & 1m Speed Calibration**.

## 🧠 SDLC (Software Development Life Cycle)

This project uses an **AI-Native Spec-Driven & Multi-Agent SDLC** designed to eliminate "vibe coding" and context drift across sessions:

1. **Proactive PM & Just-in-Time EARS Specs:** Instead of maintaining a giant monolithic document, a **Lead PM Agent** co-designs concise domain specs ([`docs/specs/`](docs/specs/)) using 1-line **EARS (`WHEN ... THE ... SHALL ...`)** rules and state machines right before each milestone, audited by a **Spec-Auditor Sub-Agent**.
2. **Sub-Agent TDD Execution:** Once a spec PR is approved and merged, **Implementer** and **Reviewer Sub-Agents** execute atomic Red-Green-Refactor TDD tasks ([`docs/plans/`](docs/plans/)) against mock hardware interfaces (`MockHubAdapter`) before touching the physical car.
3. **Automated CI & Anti-Bloat Gates:** Every PR is gated by GitHub Actions ([`docs/specs/ci-cd.md`](docs/specs/ci-cd.md)) enforcing strict Markdown line caps (`wc -l`), linting (`ESLint` + `tsc`), unit tests (`vitest`), and production builds.
4. **Repo as Persistent Memory:** [`AGENTS.md`](AGENTS.md), [`docs/SPEC.md`](docs/SPEC.md), and [`docs/STATUS.md`](docs/STATUS.md) store all architectural decisions and session handoff state so any AI agent can resume work immediately.
