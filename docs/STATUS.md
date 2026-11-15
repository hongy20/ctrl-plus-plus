# Project Status & Session Handoff (`Ctrl++`)

- **Active Milestone:** Milestone 2 — Mobile Cockpit HUD (`Drive` Tab)
- **Active Specs:** [`profile.md`](specs/profile.md), [`storage.md`](specs/storage.md), [`calibration.md`](specs/calibration.md), [`control.md`](specs/control.md), [`ui.md`](specs/ui.md), [`tech.md`](specs/tech.md)
- **Last Updated:** 2026-11-15

---

## Completed
- [x] Rebranded project to **Ctrl++** (`ctrl-plus-plus`) with plain-language README.
- [x] Organized domain specifications into clean 1-word specs: [`profile.md`](specs/profile.md) (`PRF-*`), [`storage.md`](specs/storage.md) (`STR-*`), [`calibration.md`](specs/calibration.md) (`CAL-*`), [`control.md`](specs/control.md) (`CTL-*`), [`ui.md`](specs/ui.md) (`UI-*`), and [`tech.md`](specs/tech.md) (`TCH-*`).
- [x] Completed **M1 Task 1–7** (`#14`, `#15`, `#18`, `#19`) and physical hardware verification on **`42124 Off-Road Buggy` (`TechnicHub 88012`)** (`#20`).
- [x] Completed **M2 Task 1**: `CTL-06` partial target braking (`brake(intensity?, targetSpeedMps = 0)`), M2 tuning constants (`src/driver/constants.ts`), and pure helpers (`src/driver/control.ts`).
- [x] Completed **M2 Task 2**: `Drive` Cockpit HUD (`src/components/DriveTab.tsx`) & 4-tab SPA navigation (`src/App.tsx`) covering `UI-01` & `UI-09`..`UI-13`.

---

## Next Step
Review & merge Draft PR #21 (`feat/m2-drive-hud`), and floor-test the `Drive` Cockpit HUD on **`42124 Off-Road Buggy`**.
