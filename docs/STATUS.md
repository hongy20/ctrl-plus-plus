# Project Status & Session Handoff (`Ctrl++`)

- **Active Milestone:** Milestone 1 — Web Bluetooth Vehicle Control, Profiles, Storage & Calibration
- **Active Specs:** [`profile.md`](specs/profile.md), [`storage.md`](specs/storage.md), [`calibration.md`](specs/calibration.md), [`control.md`](specs/control.md), [`ui.md`](specs/ui.md), [`tech.md`](specs/tech.md)
- **Last Updated:** 2026-11-14

---

## Completed
- [x] Rebranded project to **Ctrl++** (`ctrl-plus-plus`) with plain-language README.
- [x] Organized domain specifications into clean 1-word specs: [`profile.md`](specs/profile.md) (`PRF-*`), [`storage.md`](specs/storage.md) (`STR-*`), [`calibration.md`](specs/calibration.md) (`CAL-*`), [`control.md`](specs/control.md) (`CTL-*`), [`ui.md`](specs/ui.md) (`UI-*`), and [`tech.md`](specs/tech.md) (`TCH-*`).
- [x] Completed **M1 Task 1**: Vite + React + TS + ESLint + PWA scaffold and `src/contracts.ts`.
- [x] Completed **M1 Task 2**: Node.js engine sync (`engines.node: >=26.0.0`), GitHub Pages CI/CD workflow (`ci-cd.yml`), base path (`/ctrl-plus-plus/`), and `tests/tech-config.test.ts`.
- [x] Completed **M1 Task 3**: LEGO Wireless Protocol v3 codec (`src/lego-protocol.ts`), `WebBleHubAdapter`, and `MockHubAdapter` (`src/hub-adapter.ts`, `tests/lego-protocol-adapter.test.ts`).

---

## Next Step
Execute **M1 Task 4**: Official LEGO Vehicle Profiles (`src/profile.ts`) & Per-Hub `localStorage` Storage (`src/storage.ts`, `ledColor` on `HubProfile`) (`PRF-01`, `PRF-02`, `STR-01`..`STR-04`).
