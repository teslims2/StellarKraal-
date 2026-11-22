# Handling Dependabot Pull Requests

`.github/dependabot.yml` configures weekly (Monday) automated dependency update PRs.
Every Dependabot PR is labelled `dependencies`, carries an ecosystem label, and is
assigned to the reviewer `teslims2`.

## Monitored ecosystems

| Ecosystem | Directory | Labels | Grouping | Ignored updates |
|-----------|-----------|--------|----------|-----------------|
| npm | `/backend` | `dependencies`, `backend`, `security` | All packages in one PR (`backend-dependencies`) | `db-migrate`, `db-migrate-sqlite3` majors |
| npm | `/frontend` | `dependencies`, `frontend`, `security` | All packages in one PR (`frontend-dependencies`) | `next` majors |
| cargo | `/contracts/stellarkraal` | `dependencies`, `smart-contract` | All crates in one PR (`cargo-dependencies`) | `soroban-sdk` majors |
| github-actions | `/` (scans `.github/workflows/*`) | `dependencies`, `ci` | All actions in one PR (`github-actions`) | — |
| docker | `/backend` (`backend/Dockerfile`) | `dependencies`, `docker`, `security` | One PR per base image | — |
| docker | `/frontend` (`frontend/Dockerfile`) | `dependencies`, `docker`, `security` | One PR per base image | — |

### GitHub Actions updates

Dependabot bumps `uses:` references in workflow files (for example
`actions/checkout@v4` → `@v5`, or a pinned commit SHA plus its version comment).

Triage:

- Read the action's release notes. Major bumps often change the Node.js runtime or
  rename inputs/outputs.
- Confirm that every workflow touched by the PR ran green on the PR itself.
  Workflows that only run on `push` to `main` or on a schedule (deploy,
  container-registry, db-sync) **do not** run on the PR, so check their YAML for
  renamed or removed inputs by hand.
- Actions with write permissions or secrets access (deploy, registry push) need
  manual review even for minor bumps.

### Docker base image updates

Both Dockerfiles pin `node:20-alpine` to an immutable `@sha256:` digest. Dependabot
opens a PR when a new digest is published for the same tag (a security or patch
rebuild of the base image), and when a newer tag is available.

Triage:

- **Digest-only bumps** (same tag) are usually OS-package security patches. Merge
  once the image builds and CI (including the Trivy scan, see
  [`docs/SECURITY_SCANNING.md`](../SECURITY_SCANNING.md)) passes.
- **Tag bumps** (for example `node:20` → `node:22`) change the runtime. Treat them as
  breaking major bumps (see below). Update both Dockerfiles together so that backend
  and frontend stay on the same Node.js major, and keep `.nvmrc` / CI `node-version`
  in sync.
- Multi-stage Dockerfiles reference the same image in several `FROM` lines. Make
  sure the PR updates all of them.

## Triage process

1. **Check the labels** to identify the ecosystem (`backend`, `frontend`,
   `smart-contract`, `ci`, `docker`) and whether it is a `security` PR.
2. **Find the severity.** Security PRs link to a GitHub Security Advisory. Use its
   CVSS severity (Critical / High / Medium / Low) to pick the SLA below.
3. **Classify the bump**: patch, minor, or major (see the merge criteria table).
4. **Grouped updates**: each npm/cargo/actions ecosystem groups all matching
   packages into one PR, so a single PR may bump several packages. Classify it by
   its *largest* bump.

## Response SLA

Times are measured from when the Dependabot PR or alert is opened.

| Severity | Acknowledge / triage | Merge or mitigate | Escalation |
|----------|----------------------|-------------------|------------|
| **Critical** (CVSS 9.0–10.0) | 4 hours | 24 hours | Page on-call (see [`docs/ON_CALL_ROTATION.md`](../ON_CALL_ROTATION.md)). If no fix is available, apply a mitigation (disable the feature, WAF rule, config change) within 24 h |
| **High** (CVSS 7.0–8.9) | 1 business day | 3 business days | Raise in the team channel if blocked |
| **Medium** (CVSS 4.0–6.9) | 3 business days | 14 days | Include in the next sprint |
| **Low** (CVSS 0.1–3.9) | 1 week | 30 days, or the next routine dependency PR | None |
| Non-security version bump | 1 week | Best effort. Close PRs older than 30 days and let Dependabot reopen them | None |

If an SLA cannot be met, comment on the PR with the reason and the expected date.

## Merge criteria for security PRs

| Bump type | Ecosystem | Criteria | Merge mode |
|-----------|-----------|----------|------------|
| Patch | npm, github-actions, docker (digest) | CI fully green; no changes to runtime code beyond lockfile / pins | **Auto-merge eligible.** One approving review, then squash-merge. Can be enabled with `gh pr merge --auto --squash` |
| Minor | npm, github-actions | CI green **and** the reviewer has read the changelog for behaviour changes | Manual review, one approval |
| Patch / minor | cargo (`/contracts`) | CI green, `cargo test` passes, contract benchmarks show no regression ([`docs/PERFORMANCE_BENCHMARKS.md`](../PERFORMANCE_BENCHMARKS.md)) | Manual review. Any change to on-chain code paths needs a second reviewer |
| Major | any | Follow [Breaking major version bumps](#breaking-major-version-bumps) | Manual review, two approvals |
| Any | Touches auth, crypto, or signing libraries (`jsonwebtoken`, `@stellar/*`, `soroban-sdk`, `helmet`) | CI green plus a manual smoke test of login / wallet signing | Manual review regardless of bump size |

Never auto-merge if:

- CI was skipped or any required check is pending or failed.
- The PR bumps a package covered by an `ignore` rule (that means the rule is broken;
  fix the config instead).
- The advisory says the fix is incomplete or needs configuration changes.

## Breaking major version bumps

Major bumps are expected to break something. Do **not** merge them straight from
Dependabot's branch without these steps.

1. **Read the migration guide** linked from the release notes and list every
   breaking change that affects our usage (`grep` for the affected APIs).
2. **Check out the branch locally** (`gh pr checkout <number>`) and apply any code
   changes needed in commits on top of Dependabot's commit.
3. **Run the full test matrix:**
   - Backend: `cd backend && npm ci && npm run build && npm test`
   - Frontend: `cd frontend && npm ci && npm run build && npm test` and a
     Storybook build
   - Contracts: `cd contracts/stellarkraal && cargo test` plus benchmarks
   - Docker: `docker compose build` and `docker compose up`, then hit
     `/api/v1/health`
4. **Smoke-test the critical flows** on a local or staging stack: wallet connect,
   register collateral, request loan, repay loan. Use the e2e suite where it exists.
5. **Deploy to staging** and watch error rate and latency dashboards
   ([`docs/observability.md`](../observability.md)) for at least one hour before
   merging to `main`.
6. **Get two approvals**, then squash-merge with a description of the migration
   steps.

If the migration is too large for one PR, close the Dependabot PR, add a temporary
`ignore` rule (see below) with a link to a tracking issue, and do the upgrade in a
dedicated PR.

`next`, `soroban-sdk`, and `db-migrate*` majors are permanently ignored because they
need planned migrations (Next.js app-router changes, contract re-audit, SQLite3
native bindings). Do not remove these rules without a migration plan.

## Ignoring updates and false-positive alerts

### When an ignore rule is appropriate

- A major version needs a planned migration (see above). Link the tracking issue.
- The package is pinned for a known compatibility reason (native bindings, a
  peer-dependency conflict).
- The advisory is a **false positive** for us: the vulnerable code path is
  unreachable (for example a dev-only dependency that never ships, or a function we
  never call). Write down why in the rule comment.

An ignore rule is **not** appropriate just to silence a failing CI run, or for a
Critical/High advisory with a reachable code path. Fix it or mitigate it within the
SLA instead.

### Adding an ignore rule

Add an entry under the relevant ecosystem's `ignore:` block in
`.github/dependabot.yml`, with a comment that gives the reason and a review date or
issue link:

```yaml
    ignore:
      # Pinned until #1234 (ESM migration) lands — review 2027-01-31
      - dependency-name: "some-package"
        update-types: ["version-update:semver-major"]
      # Ignore a single known-bad release
      - dependency-name: "other-package"
        versions: ["2.3.1"]
```

You can also comment on the Dependabot PR:

- `@dependabot ignore this major version` / `this minor version` / `this dependency`

Prefer the YAML rule: it is reviewed, versioned, and documented, while PR comments
are invisible to the rest of the team.

### Dismissing a false-positive security alert

1. Open **Security → Dependabot alerts** and select the alert.
2. Click **Dismiss alert** and choose the closest reason (*Vulnerable code is not
   actually used*, *Risk is tolerable*, *Inaccurate*, etc.).
3. Add a comment explaining the analysis (which code path, why it is unreachable).
4. Revisit dismissed alerts each quarter, and whenever the dependency is upgraded.

## General review checklist

- Read the linked release notes / changelog for breaking changes.
- Let CI run fully (build, lint, tests, Trivy) before merging.
- For `backend` and `frontend`: confirm the app still builds and existing tests pass.
- For `contracts/stellarkraal`: confirm `cargo test` and contract benchmarks still pass
  (see [`docs/PERFORMANCE_BENCHMARKS.md`](../PERFORMANCE_BENCHMARKS.md)).
- For `ci`: confirm the affected workflows ran on the PR, or review their inputs by
  hand.
- For `docker`: confirm both images build and pass the container scan.

## Merging

- Squash-merge once CI is green and the merge criteria above are met.
- If a PR fails CI because of an incompatible major bump that isn't already ignored,
  either do the migration (see above) or close it and add a documented `ignore` rule.
