# Domain Spec: Technical Stack, Conventions & Quality Gates (`tech`)

- **Status:** Approved v1.3
- **Stack:** GitHub Actions (`.github/workflows/ci-cd.yml`), Node.js (engines.node via `package.json`), POSIX `wc -l`, ESLint, TypeScript, Vitest, Vite (latest production releases via `npm i`)

---

## 1. Pipeline Flow

```text
[Push / Pull Request to main]
      │
      ├──► Step 1: Doc Line-Cap Gate (wc -l) ─────────► Fail if > cap (TCH-01)
      ├──► Step 2: Lint & Typecheck (npm run lint) ───► Fail on error (TCH-02, TCH-06)
      ├──► Step 3: Unit Tests (npm test) ─────────────► Fail on error (TCH-03)
      ├──► Step 4: Production Build (npm run build) ──► Fail on error (TCH-03)
      └──► Step 5: Deploy to GitHub Pages (push main) ─► Publish dist/ (TCH-04)
```

---

## 2. EARS Behavioral Requirements

### Documentation Anti-Bloat Gate
- **TCH-01:** `WHEN a push or pull_request targets main, THE CI Pipeline SHALL check line counts of docs/SPEC.md (<= 80), docs/STATUS.md (<= 30), and all docs/specs/*.md (<= 80) using wc -l and fail the workflow if any file exceeds its cap.`

### Static Analysis, Testing & Build Gates
- **TCH-02:** `WHEN package.json is present in the repository, THE CI Pipeline SHALL run npm ci and npm run lint (ESLint + tsc --noEmit) and fail on any lint or type error.`
- **TCH-03:** `WHEN lint passes, THE CI Pipeline SHALL run npm test (vitest run) and npm run build (vite build) and fail if any test or build step fails.`
- **TCH-10:** `WHEN npm test runs, THE Test Runner (vitest run --coverage via @vitest/coverage-v8) SHALL enforce a minimum 80% coverage threshold (lines, functions, branches, statements) across core source modules and fail the build if coverage drops below threshold.`

### Latest Production Runtime, Dependency & Code Conventions
- **TCH-05:** `THE CI Pipeline and package.json SHALL always use the latest production/LTS releases (Node.js >=24 via engines.node, actions/checkout@v7, actions/setup-node@v7, and npm packages installed via npm i <pkg> rather than hardcoded legacy versions).`
- **TCH-06:** `WHEN defining a runtime constant list and its TypeScript union type, THE Codebase SHALL define the tuple once with as const and derive the type via (typeof X)[number] without duplicating string literals or using enum (enforced via ESLint no-restricted-syntax).`
- **TCH-07:** `WHEN the maintenance routine runs (weekly via GitHub Dependabot or via npm update && npm audit), THE System SHALL upgrade runtime, GitHub Actions, and npm dependencies to their latest production releases and verify all lint, test, and build gates pass with zero deprecated or vulnerable packages.`
- **TCH-08:** `THE package.json SHALL declare the Node.js runtime version in engines.node, and .github/workflows/ci-cd.yml SHALL resolve its Node.js version directly from package.json via node-version-file: 'package.json' as the single source of truth.`

### GitHub Pages Continuous Deployment
- **TCH-04:** `WHEN commits are merged to main and quality gates (TCH-01..TCH-03) pass, THE CI Pipeline SHALL upload the built dist/ artifact (actions/upload-pages-artifact) and publish it to GitHub Pages (actions/deploy-pages) over HTTPS.`
- **TCH-09:** `WHEN building the PWA via vite-plugin-pwa, THE System SHALL generate an installable web app manifest (display: 'standalone' with 192x192 and 512x512 PNG icons) and configure the production base path (/ctrl-plus-plus/) so static assets, icons, and the service worker resolve cleanly on GitHub Pages.`

---

## 3. Verification Plan
1. **GitHub Actions Check on PRs:** Verify `.github/workflows/ci-cd.yml` executes automatically on every pull request using `actions/checkout@v7` and `actions/setup-node@v7` (`node-version-file: 'package.json'`) and reports status checks for Doc Line-Cap, Lint, Test, and Build.
2. **Continuous Deployment Check on main:** Verify `.github/workflows/ci-cd.yml` uploads `dist/` and publishes to GitHub Pages via `actions/deploy-pages@v4` on push to `main`.
