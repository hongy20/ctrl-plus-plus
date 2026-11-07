# Project Status & Session Handoff (`lego-autopilot`)

- **Active Milestone:** Milestone 1 — Web Bluetooth Vehicle Control & Speed Calibration
- **Active Spec:** [`docs/specs/vehicle-control.md`](specs/vehicle-control.md) (Approved v2.0 — WebBLE)
- **Last Updated:** 2026-11-07

---

## Completed
- [x] Adopted layered SDD structure (`SPEC.md` + domain `docs/specs/` + disposable `docs/plans/`).
- [x] Pivoted to **100% Serverless Browser Web App** (`ADR-002`): Android/Desktop Chrome connects directly to `TechnicHub 88012` via Web Bluetooth (`navigator.bluetooth`)—no MacBook required.
- [x] Updated [`docs/SPEC.md`](SPEC.md), [`docs/specs/vehicle-control.md`](specs/vehicle-control.md), and [`docs/plans/m1-vehicle-control.md`](plans/m1-vehicle-control.md).

---

## Next Step
Start **Task 1** in [`docs/plans/m1-vehicle-control.md`](plans/m1-vehicle-control.md): Vite + TypeScript scaffold & `src/contracts.ts`.
