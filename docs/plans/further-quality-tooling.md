# Further quality tooling — findings, open questions, exploration avenues

**This is not an execution plan.** It summarizes the remaining proposals from the 2026-08 quality-tooling review that were not implemented immediately in that pass:

- ESLint
- Prettier
- Stylelint
- JSDoc typesafety (using Typescripts checker)

Use this document to decide _whether and when_ to pursue each item; spin off a dedicated execution plan per adopted item.

## Review context (2026-08)

What the project already had at review time beyond the improvements (mentioned above) that were implemented then: Vitest with hard 100% coverage thresholds on `lib/**`, Playwright E2E against the real built extension (Chromium + Firefox), multi-browser WXT builds, and `scripts/test-all.js` as a manual orchestrator. What was missing entirely: linting, formatting, type checking, CI, git hooks, dependency/security scanning, Node version pinning, EditorConfig/`.gitattributes`.

## Suggested sequencing and dependencies

Suggested sequence for remaining un-implemented suggestions:

1. **Git hooks** (needs lint + format to exist to be useful)
2. **CI** (needs the checks above to exist to be useful)
3. **Dependabot / security scanning** (after CI exists, so update PRs get validated)

## 1. CI — GitHub Actions (largest remaining gap)

All quality gates currently depend on a human remembering to run `npm run test:all`. The repo is hosted at `github.com:radanskoric/hotwire-inspector`.

Sketch (single workflow, phased adoption):

- **Phase A** — fast deterministic gate on push/PR: `npm ci` → lint → format:check → typecheck (whichever exist) → coverage → `build` + `build:firefox`. `npm ci` runs `postinstall: wxt prepare`, which also regenerates `.wxt/eslint-auto-imports.mjs` once ESLint exists.
- **Phase B** — Chromium E2E: needs `npm run build` first, `npx playwright install --with-deps chromium`, and `xvfb` on the runner. `tests/e2e/helpers.js` already auto-starts Xvfb on Linux when `DISPLAY` is unset, so no test changes should be needed. Note the documented gotcha: bundled Chromium is used because `channel: 'chrome'` is unavailable on Linux ARM64 (irrelevant on x64 runners, but keep the setup identical to local).
- **Phase C** — Firefox E2E (`test:e2e:firefox` + hybrid suite) if Phase B proves stable.

Open questions:

- **Repo visibility unknown** (`gh` is not authenticated locally). Affects cost (private-repo runner minutes) and CodeQL availability (see §5).
- E2E flake policy: retries vs. none; `workers: 1` is deliberate (shared Xvfb) and will make E2E the slow stage — accept or shard?
- Pin Node 22 (matches devcontainer) or a matrix? Single version is probably right for an extension.
- Later: `wxt zip` artifacts as CI artifacts; `wxt submit` publish automation (`wxt-publish-extension` is already in the dependency tree via WXT) — separate exploration entirely.

Exploration: WXT's own repository and docs have extension-CI examples worth copying conventions from.

## 2. Dependabot

~15 lines at `.github/dependabot.yml`: weekly `npm` ecosystem updates, plus `github-actions` updates once workflows exist. Consider grouped updates (one PR for all minor/patch bumps) to keep noise low. Zero open questions; trivially adoptable. Value is mostly _security patches and controlled upgrades_ for the build-time dependency tree (WXT, Vite, Vitest, Playwright).

## 3. Git hooks (Husky + lint-staged)

Sketch: `npx husky init`, pre-commit hook running `npx lint-staged`; lint-staged config running `eslint --fix` and `prettier --write` on staged files (and `stylelint --fix` for CSS). In this agent-assisted workflow, hooks are the guarantee that every commit is clean regardless of what the human or agent remembered to run.

Open questions:

- Auto-fix-and-stage vs. check-only? Auto-fix is smoother; check-only is more predictable for agents.
- Alternative: **Lefthook** (single binary, no node_modules coupling) — marginally nicer for a repo that devcontainers/agents enter fresh, but less standard.
- Should pre-push also run `npm test -- --run`? (Fast for this suite; catches broken pushes before CI.)

## 4. Node version standardization

Mismatch found during review: local machine runs Node **25.4.0**, devcontainer pins Node **22** (`javascript-node:1-22-bookworm`). Options: add `.nvmrc` with `22` + an advisory `engines: { "node": ">=22" }` in package.json (npm only warns by default), or deliberately move the devcontainer to a newer LTS instead. Open question: which version does the user want to standardize on? CI should pin whatever is chosen.

## 5. Security and dependency scanning

- **`npm audit --audit-level=high` as a CI step** — cheapest gate; expect occasional noise from transitive dev dependencies (consider `--omit=dev`, accepting the coverage tradeoff).
- **OSV-Scanner** — deterministic alternative/complement to audit, lockfile-based.
- **CodeQL** — free for public repos; requires GitHub Advanced Security for private ones → blocked on the visibility question in §1.
- Overlap note: Dependabot security updates (§2) partially substitute for an audit gate; both together is the common setup.

## 6. knip (unused dependencies/exports/files)

Likely modest value at this codebase size, but a one-off `npx knip` run is nearly free and often surprising. Exploration caveat: WXT's entrypoint conventions (`entrypoints/**` auto-discovered, `web_accessible_resources`) may produce false positives; knip needs a small config mapping WXT's entry points if adopted as a gate. Adopt as an occasional manual run first, gate later only if signal is good.

## 7. Mutation testing (Stryker)

The project enforces 100% coverage — mutation testing is the natural next layer: it verifies tests actually _assert_ behavior rather than merely execute lines. Real costs: slow runs, occasional equivalent-mutant noise, config via `@stryker-mutator/vitest-runner`. Exploration avenue: a single one-off run scoped to `lib/tree-builder.js` (smallest pure module) to measure signal vs. runtime before considering any gate. Not recommended as a blocking check initially.

## 8. Considered and deliberately not proposed

- **`eslint-plugin-no-unsanitized`** — excluded by explicit user decision. Worth revisiting if HTML-string rendering (e.g. `innerHTML`) is ever introduced into the panel; current code uses safe DOM APIs.
- **commitlint** — commit history is imperative-style, not conventional-commits; adopting it means changing commit culture, which is out of scope for tooling review.
- **markdownlint** — docs volume is low; Prettier already normalizes Markdown whitespace.
- **Biome migration** — would consolidate ESLint+Prettier into one fast tool, but loses the WXT auto-imports ESLint helper and the Playwright/Vitest plugins; only revisit if tool count becomes a maintenance burden.
- **stylelint for inline `<style>` in HTML** — noted as out of scope in the Stylelint plan (small payoff).

## Side observations from the review (notes, not proposals)

- `tests/README.md` claims `entrypoints/` is unit-test-covered, but `vite.config.js` only instruments `lib/**` — entrypoints are covered by E2E instead. Doc correction candidate.
- `package.json` has no `license` field although `LICENSE` (MIT) exists.
- `.gitignore` already covers `output`, `coverage`, `.wxt`, `test-results` — good; no changes needed for the plans above.

## Open questions (consolidated)

1. Is the GitHub repo public or private? (gates CodeQL; affects CI minutes)
2. Standardize on Node 22, or upgrade the devcontainer to a newer LTS?
3. Git hooks: Husky+lint-staged, Lefthook, or none? Auto-fix or check-only?
4. CI: adopt in phases A→B→C as sketched, or all at once?
5. E2E in CI: accept `workers: 1` runtime, or invest in sharding/stability first?
