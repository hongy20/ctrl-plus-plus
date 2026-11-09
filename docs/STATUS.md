# Project Status & Session Handoff (`Ctrl++`)

- **Active Milestone:** Milestone 1 — Web Bluetooth Vehicle Control, Profiles, Storage & Calibration
- **Active Specs:** [`profile.md`](specs/profile.md), [`storage.md`](specs/storage.md), [`calibration.md`](specs/calibration.md), [`control.md`](specs/control.md), [`ui.md`](specs/ui.md), [`tech.md`](specs/tech.md)
- **Last Updated:** 2026-11-08

---

## Completed
- [x] Rebranded project to **Ctrl++** (`ctrl-plus-plus`) with plain-language README.
- [x] Organized domain specifications into clean 1-word specs: [`profile.md`](specs/profile.md) (`PRF-*`), [`storage.md`](specs/storage.md) (`STR-*`), [`calibration.md`](specs/calibration.md) (`CAL-*`), [`control.md`](specs/control.md) (`CTL-*`), [`ui.md`](specs/ui.md) (`UI-*`), and [`tech.md`](specs/tech.md) (`TCH-*`).
- [x] Completed **M1 Task 1**: Vite + React + TS + ESLint + PWA scaffold and `src/contracts.ts`.
- [x] Completed **M1 Task 2**: Node.js engine sync (`engines.node: >=26.0.0`), GitHub Pages CI/CD workflow (`ci-cd.yml`), base path (`/ctrl-plus-plus/`), and `tests/tech-config.test.ts`.

---

## Next Step
Merge **M1 Task 2** PR, then review specs and execute **M1 Task 3** (LEGO Wireless Protocol Codec, `WebBleHubAdapter` & `MockHubAdapter`: `CTL-01`, `CTL-02`).
