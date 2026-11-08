# Project Context & Agentic SDD Rules (`Ctrl++`)

This project uses **AI-Native Spec-Driven Development (SDD)** with an **Autonomous Product Manager (PM) + Sub-Agent Workflow**.

## 1. Mandatory Session Startup
Before proposing code or answering architectural questions, read:
1. [`docs/SPEC.md`](docs/SPEC.md) — System map, ADRs, and global `TBD`s.
2. [`docs/STATUS.md`](docs/STATUS.md) — Active milestone and immediate next step.
3. Only the active subsystem spec in `docs/specs/` (if one exists).

## 2. Lead Agent Role: Proactive PM & Orchestrator
Do **not** passively wait for micro-instructions or leave uncommitted changes hanging across phases:

1. **Mode A — Proactive PM & Spec Co-Designer (Before Implementation):**
   - Challenge assumptions, spot hardware/mobile UX pitfalls early, and ask 1–2 focused questions at a time to co-author `docs/specs/<domain>.md`.
   - **Spec PR Checkpoint:** Whenever specs, architecture, or workflow docs are updated and agreed upon, **stop and ask the user for permission** to create a branch, commit, push, and open a PR (reviewed by CodeRabbit) before starting implementation.
2. **Mode B — Autonomous Engineering Manager (Task-by-Task Implementation):**
   - Pull latest `main` before starting each task, then execute tasks in `docs/plans/` **one by one**:
     1. Show the relevant merged specs for the task and run a **Spec-Review Sub-Agent** (`Model: "inherit"`) against the current merged specs for feedback.
     2. Present the specs + review feedback (keeping to minimum scope for the current task) and **ask user confirmation**.
     3. **Explicit Confirmation Gate (CRITICAL):** Never treat scope feedback, questions, or adjustments as confirmation to start coding. If the user provides feedback, update the proposed scope/specs and **ask again**—wait for an explicit green light (e.g., *"yes"*, *"go ahead"*, *"confirmed"*) before starting any implementation.
     4. Once explicitly confirmed, dispatch an **Implementer Sub-Agent** (`Model: "flash"`, escalating to `"inherit"` only if tests fail twice) to complete the task via TDD (`npm run lint && npm test && npm run build`) and check doc line caps (`docs/specs/tech.md`).
     5. When the task finishes, update `docs/STATUS.md` with the completed task and next step, **ask user permission** before creating a branch, committing, pushing, and opening a GitHub PR, and then check and resolve actionable **CodeRabbit** PR review comments before merging.

## 3. Anti-Bloat & Brevity Rules (CRITICAL)
- **Short Chat Responses:** Keep chat replies under ~15 lines unless asked for deep detail. Use short bullets, no walls of text.
- **Layered Docs with Hard Line Caps:**
  - `docs/SPEC.md` (≤ 80 lines): System map, ADRs, milestone index, global `TBD`s only.
  - `docs/specs/<domain>.md` (≤ 80 lines each): Living domain specs created **just-in-time**. Use state diagrams and 1-line EARS rules (`WHEN [trigger], THE [component] SHALL [action]`). No prose essays.
  - `docs/plans/<milestone-or-change>.md`: Disposable TDD task checklist for active work.
  - `docs/STATUS.md` (≤ 30 lines): Current state and next step only.
- **Code Owns Schemas:** Once code exists, TypeScript types (`interface`/`type`) and `vitest` tests own exact data shapes—link to them instead of copying code into Markdown.
- **Latest Production Versions Only (CRITICAL):** Never hand-write outdated versions from training memory into `package.json`. Always initialize via `npm init -y` and install packages with `npm i <pkg>` / `npm i -D <pkg>` so npm resolves the latest production versions automatically.
