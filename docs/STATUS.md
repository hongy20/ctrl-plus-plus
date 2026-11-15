# Project Status & Session Handoff (`Ctrl++`)

- **Active Milestone:** Milestone 2 — Mobile Cockpit HUD (`Drive` Tab)
- **Active Specs:** [`profile.md`](specs/profile.md), [`storage.md`](specs/storage.md), [`calibration.md`](specs/calibration.md), [`control.md`](specs/control.md), [`ui.md`](specs/ui.md), [`tech.md`](specs/tech.md)
- **Last Updated:** 2026-11-15

---

## Completed
- [x] Rebranded project to **Ctrl++** (`ctrl-plus-plus`) with plain-language README.
- [x] Organized domain specifications into clean 1-word specs: [`profile.md`](specs/profile.md) (`PRF-*`), [`storage.md`](specs/storage.md) (`STR-*`), [`calibration.md`](specs/calibration.md) (`CAL-*`), [`control.md`](specs/control.md) (`CTL-*`), [`ui.md`](specs/ui.md) (`UI-*`), and [`tech.md`](specs/tech.md) (`TCH-*`).
- [x] Completed **M1 Task 1–3**: Scaffold/contracts, Node 26 CI/CD & GitHub Pages, LWP v3 codec & BLE/Mock adapters (`#14`, `#15`, `#18`).
- [x] Completed **M1 Task 4–7**: Profiles & `localStorage` (`src/profile.ts`, `src/storage.ts`), `VehicleDriver` calibration/control/watchdog/`CTL-10` (`src/vehicle-driver.ts`), mobile lifecycle (`src/lifecycle.ts`), and React SPA (`src/App.tsx`) (`#19`).
- [x] Verified **M1 on physical `42124 Off-Road Buggy` (`TechnicHub 88012`)**: Fixed motor encoder `POS` mode (`0x02`), 1m speed-cal `drivePolarity`, `StartPower(127)` hold-brake, and `0x08`/`0x09` string properties.

---

## Next Step
Co-design **Milestone 2** (`Drive` Cockpit HUD in [`ui.md`](specs/ui.md)), including dead-man throttle vs. cruise-control toggle UX.
