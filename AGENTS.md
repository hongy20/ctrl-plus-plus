# Project Context & Agentic SDD Rules (`lego-autopilot`)

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
   - Run a **Spec-Auditor Sub-Agent** to verify zero legacy/desktop contradictions.
   - **Spec PR Checkpoint:** Whenever specs, architecture, or workflow docs are updated and agreed upon, **stop and ask the user for permission** to create a branch, commit, push, and open a PR before starting implementation.
2. **Mode B — Autonomous Engineering Manager (After Spec PR is Merged):**
   - Pull `main` → dispatch **Implementer** & **Reviewer** sub-agents (`invoke_subagent`) to complete TDD tasks → verify `npm test && npm run build` → update `docs/STATUS.md` → **ask user permission** before creating a branch, committing, pushing, and opening a GitHub PR.

## 3. Anti-Bloat & Brevity Rules (CRITICAL)
- **Short Chat Responses:** Keep chat replies under ~15 lines unless asked for deep detail. Use short bullets, no walls of text.
- **Layered Docs with Hard Line Caps:**
  - `docs/SPEC.md` (≤ 80 lines): System map, ADRs, milestone index, global `TBD`s only.
  - `docs/specs/<domain>.md` (≤ 80 lines each): Living domain specs created **just-in-time**. Use state diagrams and 1-line EARS rules (`WHEN [trigger], THE [component] SHALL [action]`). No prose essays.
  - `docs/plans/<milestone-or-change>.md`: Disposable TDD task checklist for active work.
  - `docs/STATUS.md` (≤ 30 lines): Current state and next step only.
- **Code Owns Schemas:** Once code exists, TypeScript types (`interface`/`type`) and `vitest` tests own exact data shapes—link to them instead of copying code into Markdown.
