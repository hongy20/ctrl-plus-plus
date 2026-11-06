# Project Context & Agentic SDD Rules (`lego-autopilot`)

This project uses **AI-Native Spec-Driven Development (SDD)**.

## 1. Mandatory Session Startup
Before proposing code or answering architectural questions, read:
1. [`docs/SPEC.md`](docs/SPEC.md) — System map, ADRs, and global `TBD`s.
2. [`docs/STATUS.md`](docs/STATUS.md) — Active milestone and immediate next step.
3. Only the active subsystem spec in `docs/specs/` (if one exists).

## 2. Anti-Bloat & Brevity Rules (CRITICAL)
- **Short Chat Responses:** Keep chat replies under ~15 lines unless asked for deep detail. Use short bullets, no walls of text.
- **Layered Docs with Hard Line Caps:**
  - `docs/SPEC.md` (≤ 80 lines): System map, ADRs, milestone index, global `TBD`s only.
  - `docs/specs/<domain>.md` (≤ 80 lines each): Living domain specs created **just-in-time**. Use state diagrams and 1-line EARS rules (`WHEN [trigger], THE [component] SHALL [action]`). No prose essays.
  - `docs/plans/<milestone-or-change>.md`: Disposable TDD task checklist for active work (skip for 1–2 task tweaks).
  - `docs/STATUS.md` (≤ 30 lines): Current state and next step only.
- **Code Owns Schemas:** Once code exists, TypeScript types (`interface`/`type`) and `vitest` tests own exact data shapes—link to them instead of copying code into Markdown.

## 3. Working Agreement
- **Spec First, Code Second:** Update the relevant spec before writing implementation code.
- **Explicit `TBD`s over Guessing:** Never guess hardware models, ports, or protocols—record `TBD`s and ask.
- **Session Handoff:** Keep `docs/STATUS.md` updated at milestone boundaries or session wrap-up.
