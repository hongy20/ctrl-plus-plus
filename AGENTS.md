# Project Context & Agentic SDD Rules (`lego-autopilot`)

This project is built using **AI-Native Spec-Driven Development (SDD)**.

## 1. Mandatory Session Startup Protocol

Whenever a new chat session starts in this repository, **before proposing code or answering architectural questions**, you MUST read:
1. [`docs/SPEC.md`](docs/SPEC.md) — The single source of truth for system architecture, interfaces, locked decisions, and open `TBD` items.
2. [`docs/STATUS.md`](docs/STATUS.md) — Current milestone, recent session summary, and the immediate next step.

## 2. Spec-Driven Workflow Phases

We follow a strict 5-phase SDD loop:
1. **Phase 1: Discovery & Scoping** — Clarify constraints, hardware boundaries, and non-goals.
2. **Phase 2: The Living Spec (`docs/SPEC.md`)** — Define data models, network/BLE contracts, state machines, and edge/safety cases before coding.
3. **Phase 3: Test & Verification Plan** — Define how each requirement will be verified (simulator/mock streams first, hardware-in-the-loop second).
4. **Phase 4: Task Breakdown (`docs/PLAN.md`)** — Slice the current milestone into small, atomic, verifiable steps.
5. **Phase 5: Agentic Execution Loop** — Implement code to satisfy tests and spec; update `docs/SPEC.md` and `docs/STATUS.md` as we learn.

## 3. Working Agreement with the User

- **Spec First, Code Second:** Never write implementation code for a feature whose interface or behavior is not yet specified in `docs/SPEC.md`. If requirements change, update `docs/SPEC.md` first.
- **Explicit `TBD`s over Guessing:** Do not silently assume hardware models, motor ports, or sensor protocols. Record unknowns in the `Open Questions & TBDs` section of `docs/SPEC.md` and ask the user.
- **Educational Guidance:** The user is exploring Modern Agentic SDD end-to-end. Explain SDD concepts, rationale, and tradeoffs clearly whenever transitioning phases or when asked.
- **Session Handoff:** At the end of a milestone or when the user asks to wrap up a session, always update `docs/STATUS.md` so the next session can resume with zero context loss.
