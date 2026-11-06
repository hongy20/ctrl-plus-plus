# Project Status & Session Handoff (`lego-autopilot`)

- **Current SDD Phase:** Phase 1 — Discovery & Scoping (Transitioning to Phase 2: Milestone 1 Spec)
- **Active Milestone:** Pre-Milestone 1 (Hardware & Stack Confirmation)
- **Last Updated:** 2026-11-06

---

## Completed So Far
- [x] Defined high-level project vision: autonomous features (obstacle avoidance, calibrated speed control, target following) on top of a stock Lego Technic RC car.
- [x] Locked core architecture (**ADR-001**, **ADR-002**, **ADR-003** in [`docs/SPEC.md`](SPEC.md)):
  - Stock **Lego Technic Control+ / Powered Up BLE Hub** controlled directly from Mac over Bluetooth.
  - **Off-board Brain** running on Mac for vision, sensor fusion, and control loops.
  - Lightweight wireless **Micro-Board Pod** attached to the car for camera/sensor streaming.
- [x] Initialized SDD repository memory structure (`AGENTS.md`, `docs/SPEC.md`, `docs/STATUS.md`).

---

## Current Open Items (Next Session Entry Point)
To complete **Phase 1** and flesh out the detailed interface contracts for **Milestone 1 (Vehicle Control & Speed Calibration)** in [`docs/SPEC.md`](SPEC.md), we need to resolve:
1. **TBD-1:** Exact Lego Technic set / Hub model and motor port layout (or decide to build a generic port-scanner script first).
2. **TBD-2:** Micro-board & sensor hardware on hand vs. needing a hardware shopping list (BOM).
3. **TBD-3:** Confirm Python as the Mac host language.

---

## How to Resume in a New Agent Session
Start a new chat in `/Users/yanhong/Github/hongy20/lego-autopilot` and say:
> *"Read `AGENTS.md` and let's continue."*
