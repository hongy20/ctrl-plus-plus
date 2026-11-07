# Domain Spec: CI/CD & Quality Gates (`ci`)

- **Status:** Approved v1.1
- **Stack:** GitHub Actions (`.github/workflows/ci.yml`, `actions/checkout@v7`, `actions/setup-node@v7`), Node.js 26 LTS (`lts/*`), POSIX `wc -l`, ESLint 10, TypeScript 7, Vitest 5, Vite 8

---

## 1. Pipeline Flow

```text
[Push / Pull Request to main]
      │
      ├──► Step 1: Doc Line-Cap Gate (wc -l) ─────────► Fail if > cap (CI-01)
      ├──► Step 2: Lint & Typecheck (npm run lint) ───► Fail on error (CI-02)
      ├──► Step 3: Unit Tests (npm test) ─────────────► Fail on error (CI-03)
      └──► Step 4: Production Build (npm run build) ──► Fail on error (CI-03)
```

---

## 2. EARS Behavioral Requirements

### Documentation Anti-Bloat Gate
- **CI-01:** `WHEN a push or pull_request targets main, THE CI Pipeline SHALL check line counts of docs/SPEC.md (<= 80), docs/STATUS.md (<= 30), and all docs/specs/*.md (<= 80) using wc -l and fail the workflow if any file exceeds its cap.`

### Static Analysis, Testing & Build Gates
- **CI-02:** `WHEN package.json is present in the repository, THE CI Pipeline SHALL run npm ci and npm run lint (ESLint + tsc --noEmit) and fail on any lint or type error.`
- **CI-03:** `WHEN lint passes, THE CI Pipeline SHALL run npm test (vitest run) and npm run build (vite build) and fail if any test or build step fails.`

### Latest Production Runtime & Dependency Policy
- **CI-05:** `THE CI Pipeline and package.json SHALL always use the latest production/LTS releases (Node.js lts/*, actions/checkout@v7, actions/setup-node@v7, and npm packages installed via npm i <pkg> rather than hardcoded legacy versions).`

### Deployment Gate (Deferred Until Repo Goes Public)
- **CI-04:** `WHEN the repository visibility is switched to Public and commits are merged to main, THE CI Pipeline SHALL publish the built dist/ artifact to GitHub Pages (actions/deploy-pages).`

---

## 3. Verification Plan
1. **GitHub Actions Check on PRs:** Verify `.github/workflows/ci.yml` executes automatically on every pull request using `actions/checkout@v7` and `actions/setup-node@v7` (`lts/*`) and reports status checks for Doc Line-Cap, Lint, Test, and Build.
