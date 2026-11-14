# Project Context & Agentic SDD Rules (`Ctrl++`)

This project uses **AI-Native Spec-Driven Development (SDD)**: specs are the single source of truth, the user sets the pace, and sub-agents do the work.

## 1. Mandatory Session Startup
Before proposing code or answering architectural questions, read:
1. [`docs/SPEC.md`](docs/SPEC.md) — System map, ADRs, and global `TBD`s.
2. [`docs/STATUS.md`](docs/STATUS.md) — Active milestone and immediate next step.
3. Only the active subsystem spec in `docs/specs/` (if one exists).

## 2. Pacing Rule (CRITICAL)
Every ⏸ below is a stop point: wait for an explicit green light (e.g., *"yes"*, *"go ahead"*, *"confirmed"*) before moving past it. Never edit files, launch sub-agents, or create a branch, commit, push, or open a PR without one. Status updates (*"merged"*, *"deployed"*), questions, and scope feedback are **never** a green light: update the proposal and ask again.

## 3. Mode A — Spec Co-Design (Before Implementation)
- Challenge assumptions, spot hardware/mobile UX pitfalls early, and ask 1–2 focused questions at a time to co-author `docs/specs/<domain>.md`.
- ⏸ Once spec, architecture, or workflow docs are agreed, ask before opening a PR (§5).

## 4. Mode B — Task-by-Task Implementation (`docs/plans/`)
1. ⏸ Wait for the user to start the next task.
2. Pull latest `main`, show the task's merged specs, and run a **Spec-Review Sub-Agent** (primary reasoning model, e.g., `inherit`) against them.
3. ⏸ Present the specs + review feedback, keeping to the minimum scope for the task.
4. **Test-Writer Sub-Agent** (primary reasoning model): write failing `vitest` tests for the task's EARS rules only, naming each test after its requirement ID (e.g., `CTL-07: …`), and run them to confirm they fail before any implementation exists.
5. ⏸ Present the failing tests (requirement ID → test names) for review.
6. **Implementer Sub-Agent** (fast coding model, e.g., `flash` / `haiku`; escalate to the primary reasoning model if tests fail twice): make the approved tests pass with `npm run lint && npm test && npm run build`, and check doc line caps (`docs/specs/tech.md`). It must not edit or delete approved tests; if a test looks wrong, it stops and reports back (⏸).
7. Update `docs/STATUS.md` with the completed task and next step, then ⏸ ask before opening a PR (§5).

## 5. Pull Requests & CodeRabbit
- Open **draft PRs** only (`gh pr create --draft`); the user reviews first, then marks them ready for CodeRabbit.
- ⏸ If a CodeRabbit comment proposes behavior not yet in `docs/specs/*.md`, ask whether to add it to the spec first.
- Batch follow-up fixes into a single push (CodeRabbit OSS rate limits) and resolve fixed review threads via GitHub GraphQL (`resolveReviewThread`).
- Don't re-run `lint`/`test`/`build` in the main session after a sub-agent verified them; delegate routine `git`, `gh`, and PR-check CLI work to the **lightest model tier** (e.g., `flash_lite` / `haiku`) to keep verbose output out of the main context.

## 6. Anti-Bloat & Brevity Rules
- **Short Chat Responses:** Keep chat replies under ~15 lines unless asked for deep detail. Use short bullets, no walls of text.
- **Layered Docs with Hard Line Caps:**
  - `docs/SPEC.md` (≤ 80 lines): System map, ADRs, milestone index, global `TBD`s only.
  - `docs/specs/<domain>.md` (≤ 80 lines each): Living domain specs created **just-in-time**. Use state diagrams and 1-line EARS rules (`WHEN [trigger], THE [component] SHALL [action]`). No prose essays.
  - `docs/plans/<milestone-or-change>.md`: Disposable TDD task checklist for active work.
  - `docs/STATUS.md` (≤ 30 lines): Current state and next step only.
- **State Each Value Once:** Thresholds and tuning values live only in their domain spec's *Tuning Constants* table; plans and other specs reference the constant name or requirement ID.
- **Code Owns Schemas:** Once code exists, TypeScript types (`interface`/`type`) and `vitest` tests own exact data shapes—link to them instead of copying code into Markdown.
- **Latest Production Versions Only:** Never hand-write versions from training memory into `package.json`. Initialize via `npm init -y` and install with `npm i <pkg>` / `npm i -D <pkg>` so npm resolves the latest production versions.
