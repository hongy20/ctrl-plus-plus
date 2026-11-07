# Project Status & Session Handoff (`ctrl-plus-plus`)

- **Active Milestone:** Milestone 1 — Web Bluetooth Vehicle Control & Speed Calibration
- **Active Specs:** [`docs/specs/vehicle-control.md`](specs/vehicle-control.md) (v2.4), [`docs/specs/mobile-web-ui.md`](specs/mobile-web-ui.md) (v1.0)
- **Last Updated:** 2026-11-07

---

## Completed
- [x] Adopted layered SDD structure + Proactive PM & Sub-Agent workflow in [`AGENTS.md`](../AGENTS.md).
- [x] Locked **React 19 + TypeScript + Tailwind + Vite SPA & Offline PWA** (`ADR-002`) so WebBLE stays alive across views and works offline on Android Chrome.
- [x] Split EARS requirements cleanly by domain into [`docs/specs/vehicle-control.md`](specs/vehicle-control.md) (`VC-01`..`VC-11`) and [`docs/specs/mobile-web-ui.md`](specs/mobile-web-ui.md) (`UI-01`..`UI-06`).

---

## Next Step
After merging the M1 Spec & Workflow PR, execute **M1 Tasks 1–6** in [`docs/plans/m1-vehicle-control.md`](plans/m1-vehicle-control.md) via autonomous sub-agents.
