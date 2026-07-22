# GitHub integration — signal links + auto-resolve from PRs and commits

> **Documentation** — durable homes after stabilization: a new `dev-docs/github-integration.md`, with cross-links from `dev-docs/signals.md` (lifecycle consumers) and `dev-docs/agent-dispatch.md` (the loop this closes, incl. the 5.16 handshake). Related current docs: `dev-docs/signals.md`, `dev-docs/agent-dispatch.md`, `dev-docs/slack-integration.md` (the integration pattern this clones), `dev-docs/feature-flags.md`.
>
> **Origin** — product request (Alex, 2026-07-22): when a PR or commit containing "magic words" plus a Latitude signal slug lands on a configured branch, resolve (or unresolve, or just link) the referenced signal automatically, and surface the linked PRs/commits on the signal detail page.
>
> **Closes the loop deferred by `specs/agent-dispatch.md` D7** — "the real closure of the loop is the customer merging the PR in GitHub, which Latitude does not track." This integration is that tracking: `signal → agent → PR → merge → signal resolved`, with zero write permissions on the customer's repo.

## Contents

1. [Purpose](#1-purpose)
2. [Ground truth — codebase](#2-ground-truth--codebase)
3. [Ground truth — GitHub mechanics](#3-ground-truth--github-mechanics)
4. [Concept model](#4-concept-model)
5. [Specification](#5-specification)
   - [5.1 GitHub App, least privilege](#51-github-app-least-privilege)
   - [5.2 Install / claim / disconnect](#52-install--claim--disconnect)
   - [5.3 Data model](#53-data-model)
   - [5.4 Configuration: org defaults + project overrides](#54-configuration-org-defaults--project-overrides)
   - [5.5 Reference matching engine](#55-reference-matching-engine)
   - [5.6 Keyword customization — no user regex](#56-keyword-customization--no-user-regex)
   - [5.7 Webhook receiver](#57-webhook-receiver)
   - [5.8 Event processing](#58-event-processing)
   - [5.9 PR/commit dedup — merge attribution](#59-prcommit-dedup--merge-attribution)
   - [5.10 Action semantics](#510-action-semantics)
   - [5.11 Signal detail UI](#511-signal-detail-ui)
   - [5.12 Settings UI](#512-settings-ui)
   - [5.13 Security and tenancy](#513-security-and-tenancy)
   - [5.14 Failure policy](#514-failure-policy)
   - [5.15 Self-hosting](#515-self-hosting)
   - [5.16 Agent-dispatch handshake](#516-agent-dispatch-handshake)
6. [Edge cases](#6-edge-cases)
7. [Out of scope](#7-out-of-scope)
8. [Resolved questions](#8-resolved-questions)
9. [Decisions](#9-decisions)
10. [Plan](#10-plan)
11. [Tasks](#11-tasks)

---

## 1. Purpose

```
Production traces → signals → escalation → agent dispatch → PR    [ships]
                                                    ↓
                              GITHUB INTEGRATION: PR/commit merged
                              → parse "Fixes LAT-XY9Z" → resolve signal   [this spec]
                              → linked PRs/commits shown on the signal page
```

Latitude already wakes coding agents on signals (`dev-docs/agent-dispatch.md`) and lets humans resolve signals manually (`specs/signal-resolve-ignore.md`, shipped). What's missing is the **feedback edge**: nothing tells Latitude that the fix landed. This spec adds a **GitHub App integration** that:

- reacts to **pull request events** (not only merges — opened/edited/closed/reopened too) and **push events** on configured repos/branches, with the **least possible GitHub permissions** (read-only, three permissions total);
- scans commit messages, branch names, PR titles, and PR descriptions for **magic words + a signal slug** (`Fixes LAT-XY9Z`, `fixes #LAT-XY9Z`, `LAT-XY9Z is fixed`, …);
- **links** every matching PR/commit to the signal (many-to-many), and on merge to the configured branch applies the matched **action**: resolve, unresolve, or reference (link without lifecycle effect);
- renders the linked PRs/commits as a **pill** on the signal detail page (first item in the header action bar), with a popover when more than one link exists;
- is configured at the **organization level with project-level overrides**, exactly like the Cursor/agent-dispatch config cascade;
- lets users **customize the magic words** as plain keyword lists per action (no user-supplied regex — see 5.6);
- **teaches dispatched agents the convention** (5.16): the default agent-dispatch prompt gains slug-branded branch/PR-title instructions, so an agent-authored fix auto-links on open and auto-resolves on merge without any human typing a slug.

The one-line model: **GitHub is an inbound integration that turns merged code into signal lifecycle transitions, the way GitHub's own "Fixes #123" closes issues.**

## 2. Ground truth — codebase

Everything below was verified in code on `development` at `6ce5219f3` (2026-07-22).

| Piece | Where | Relevance |
| --- | --- | --- |
| **Signal slug** — JIRA-style `LAT-XY9Z`: 3-char uppercase project prefix + `-` + 4-char uppercased cuid2. Assigned once at creation, **never regenerated** (rename-safe). Unique per `(organization_id, project_id, slug) WHERE deleted_at IS NULL`; soft-delete frees the slug. | `packages/domain/signals/src/slug.ts`, `schema/signals.ts` (`signals_unique_slug_per_project_idx`) | The stable reference token users type in commits. Lookup: `SignalRepository.findBySlug({ projectId, slug })`. Effective shape `^[A-Z]{3}-[A-Z0-9]{4}$` (cuid2 suffix uppercased). The stale "regenerated on rename" comments in `signal.ts:53` / `schema/signals.ts:19` are wrong — fix them in passing. |
| **Lifecycle commands** — `applySignalLifecycleCommandUseCase`: batch `signalIds[]`, one transaction, `findByIdForUpdate`, idempotent (`changed: false` on no-ops), cross-project ids rejected. `resolve` clears `ignoredAt`/`regressedAt`/`mutedAt`; `unresolve` clears `resolvedAt`+`mutedAt`. Emits `SignalEscalationEnded(reason)` on changed resolve/ignore. **No actor attribution** (deliberate deferral, `specs/signal-resolve-ignore.md` D10). | `packages/domain/signals/src/use-cases/apply-signal-lifecycle-command.ts` | The integration calls this verbatim; attribution lives on the **link row**, not the signal. Regression detection (`SignalRegressed`) already reopens auto-resolved signals that recur — free synergy. |
| **Integrations parent table** — `integrations` (id, organization_id, kind, vendor_account_id, installed_by_user_id, installed_at, revoked_at), partial unique `(kind, vendor_account_id) WHERE revoked_at IS NULL`. Its doc comment already names **GitHub Apps** as an intended future kind with a per-vendor `_details` child. | `packages/platform/db-postgres/src/schema/integrations.ts` | GitHub is a new `kind = "github"` with `vendor_account_id = installation_id` — one installation ↔ one Latitude org. |
| **Org-default + project-override cascade** — `agent_dispatch_configs`: org default = row with `project_id IS NULL`, override = row per `(project_id, integration_id)`; each override field is `null → inherit` or set → **replace wholesale** (no deep merge); resolved by the pure `resolveEffectiveConfig` helper. | `schema/agent-dispatch-configs.ts`, `packages/domain/agent-dispatch/src/helpers/resolve-effective-config.ts` | The "similar to our Cursor integration" cascade this spec mirrors for matching rules and monitor toggles. |
| **Inbound webhooks** — **none exist**. The Slack HMAC verifier (`verifySlackSignature`: HMAC-SHA256, constant-time compare, replay window) is written but unused; Slack OAuth callbacks live as TanStack server routes in `apps/web/src/routes/integrations/slack/*` with Redis CSRF state. | `packages/platform/slack/src/signature.ts`, `apps/web/src/server/slack-oauth-state.ts` | The receiver is greenfield. Public unauthenticated API routes exist as precedent: `apps/api/src/routes/{health,bootstrap}.ts` mounted **before** the auth wall in `apps/api/src/routes/index.ts`, `createRoute` + `"x-fern-ignore": true` + own rate limiter. |
| **Queue** — typed topic registry (`packages/domain/queue/src/topic-registry.ts`); `PublishOptions` has `dedupeKey`, `debounceMs`, `attempts`, `backoff`; consumer `start()` fails unless every topic has a handler. Workers register in `apps/workers/src/server.ts`. | `packages/domain/queue/src/index.ts`, `packages/platform/queue-bullmq/src/adapter.ts` | New `github-events` queue. Note: there is **no plain `delayMs`** publish option today — the push grace delay (5.9) adds one (or reuses `debounceMs` semantics, which fires after the window on a single publish). |
| **Encryption** — app-layer AES-256-GCM via `encryptField`/`decryptField` + `LAT_MASTER_ENCRYPTION_KEY`; repositories encrypt on write, decrypt on read. | `packages/platform/db-postgres/src/encryption-key.ts` | Not needed for per-org secrets here (the App credentials are platform env vars; no per-org GitHub tokens are stored — D6). |
| **Signal detail header** — actions render in order: `SignalSendTo` → `SignalTriageControls` (assignee, priority) → `SignalLifecycleActions`. PR #4182 shipped the exact pill+popover pattern to mirror: `SignalDispatchHistory` — an outline `sm` `Button` pill (icon + label) whose `Popover` (`modal={false}`, `align="end"`, `max-w-72 p-2`) shows a header row (title + "View all" settings link) above a `max-h-80` scrollable `divide-y` list of rows, each an `<a target="_blank">` with icon, label, `Status` chip, and a muted `relativeTime` meta line; fed by a `listSignalDispatches` server fn. | `apps/web/src/routes/_authenticated/projects/$projectSlug/signals/$signalSlug/index.tsx`, `.../-components/signal-dispatch-history.tsx` | The GitHub links pill goes **first**, before `SignalSendTo`, and clones the `signal-dispatch-history.tsx` anatomy. |
| **Feature flags** — code registry `FEATURE_FLAGS` + per-org DB enablement; missing rows = disabled. | `packages/domain/feature-flags/src/registry.ts` | New flag gates the whole surface for staged rollout. |
| **No public-API exposure of integrations** — `@repo/operations` has zero integration operations; agent-dispatch settings are web server fns only ("UI leads" precedent, `specs/signal-send-to.md`). | `packages/operations/src` | MVP ships no REST/SDK/MCP surface → no `pnpm generate:*` churn. |

## 3. Ground truth — GitHub mechanics

Verified against GitHub docs (2026-07):

- **Permissions → events.** A GitHub App's subscribable webhook events are gated by its permissions: `pull_request` needs **Pull requests: Read-only**; `push` needs **Contents: Read-only** (no narrower permission exists for push); **Metadata: Read-only** is forced on every app. That is the complete permission set — no write access of any kind. Installation lifecycle events (`installation`, `installation_repositories`) need no extra permission.
- **App webhook.** Each GitHub App has a single automatically-created webhook (one app-level secret we control) that receives events for **every installation**, each payload carrying an `installation.id` for tenant routing. No customer ever configures a URL or secret. An app can operate **purely on webhook payloads** — API calls are only needed for the repo picker, oversized pushes, and the install-claim check.
- **Detecting a merge.** Merged PRs arrive as `action: "closed"` with `pull_request.merged: true`. `merge_commit_sha` semantics per merge method: **merge commit** → the merge commit's SHA; **squash** → the squash commit's SHA on the base branch; **rebase** → the SHA the base branch was updated to (last rebased commit). Before `merged: true`, `merge_commit_sha` holds a *test-merge* SHA — never read it pre-merge.
- **A PR merge also fires a `push`** on the base branch (there is no dedicated "merge" event); the two deliveries arrive independently, **in no guaranteed order**. This is the duplication problem 5.9 solves. The join keys: squash/merge-commit pushes contain a commit whose `id` equals the PR's `merge_commit_sha`; rebase pushes have `after == merge_commit_sha`; merge-commit pushes also contain the PR head (`head.sha`).
- **`push` payload**: `ref` (`refs/heads/main`), `before`/`after`, `created`/`deleted`/`forced`, and `commits[]` (`id`, `distinct`, `message`, `timestamp`, `author`, `url`, file lists) capped at **2048 commits** (the infamous 20-commit cap is the REST Events API, not webhooks). Beyond the cap, walk the `before...after` range via the compare/Commits API.
- **Delivery contract**: respond 2xx within **10 seconds** (ack fast, process async); `X-Hub-Signature-256` = HMAC-SHA256 of the **raw body** with the app secret (constant-time compare); `X-GitHub-Delivery` GUID is the idempotency key; **GitHub does not auto-retry** failed deliveries — recovery is the manual/API redelivery endpoint (`POST /app/hook/deliveries/{id}/attempts`, App JWT auth).
- **Install flow**: customers install at `https://github.com/apps/<slug>/installations/new?state=<nonce>`; GitHub redirects to the app's **setup URL** with `installation_id` + `setup_action` + `state`. **The redirect is spoofable** ("you should not rely on the validity of the `installation_id` parameter") — the documented fix is "Request user authorization (OAuth) during installation": the callback then carries a `code`, exchanged for a user token used once to verify via `GET /user/installations` that the installing user really has that installation.
- **Prior art — GitHub closing keywords**: `close(s|d)`, `fix(es|ed)`, `resolve(s|d)`, case-insensitive, optionally followed by a colon, keyword immediately before the reference, one keyword per reference, and only effective when the PR targets the **default branch**. Our matcher is deliberately looser (5.5) but this anchors the defaults.
- **ReDoS research** (kept as the blueprint should user regex ever ship): GitLab runs every user regex through RE2 with a 511-char cap; the right Node stack would be `re2js` (MIT, pure JS, linear-time). This research is what informed **dropping user-supplied regex from the MVP entirely** (5.6/D6) — keyword-only customization has no ReDoS surface to defend.

## 4. Concept model

```
                     ┌──────────────────────────────────────────────────────┐
GitHub App (1/env)   │  Latitude org  ← claims →  installation (1:1)        │
  Pull requests: R   │      │                                               │
  Contents: R        │      └── github_sync_configs                         │
  Metadata: R        │            ├── org-default row (project_id NULL):    │
                     │            │     magic words, monitor toggles        │
                     │            └── project rows (N per project):         │
                     │                  repo + branch + nullable overrides  │
                     └──────────────────────────────────────────────────────┘

pull_request / push ──▶ receiver (verify HMAC, slim-extract, enqueue, 202)
                             │
                     github-events worker
                             │  delivery ledger claim (idempotency)
                             │  installation → org → repo configs → projects
                             │  matcher: sources × rules → (slug, action)[]
                             │  slug → SignalRepository.findBySlug (per project)
                             ▼
                     github_signal_links (N:M signal ↔ PR/commit)
                             │  on merge to configured branch:
                             ▼
                     applySignalLifecycleCommand(resolve | unresolve)
```

Two link types, four text sources, three actions (`resolve`, `unresolve`, `reference`):

| | Linked when | Text sources | Action applied when |
| --- | --- | --- | --- |
| **Pull request** | any monitored PR event matches | PR title, PR description, head branch name, and (via merge attribution, 5.9) the merged commits' messages | merged into the configured branch |
| **Commit** | a commit pushed to the configured branch matches, and the push is not attributable to a PR merge | commit message | immediately (landing on the branch *is* the merge) |

A "branch" is a **text source** (the PR's head ref), not a third link type — branches reach Latitude through the PRs that carry them (D4).

## 5. Specification

### 5.1 GitHub App, least privilege

One GitHub App per environment (production, staging; self-hosters register their own — 5.15). Registration:

- **Repository permissions**: Pull requests **Read-only**, Contents **Read-only**, Metadata **Read-only** (forced). Nothing else, nothing writable. The app never writes to GitHub — no PR comments, no commit statuses, no check runs (all would need write permissions; see [Out of scope](#7-out-of-scope)).
- **Subscribed events**: `pull_request`, `push`, `installation`, `installation_repositories`.
- **Webhook URL**: `https://<api-host>/webhooks/github` (5.7). **Webhook secret**: high-entropy, env-managed.
- **Setup URL** with "Redirect on update" enabled; **Request user authorization (OAuth) during installation** enabled (needed for the anti-spoofing claim check, 5.2).

Environment variables (all `parseEnv`-read, added to `.env.example`; the integration is hidden when unset):

```
LAT_GITHUB_APP_ID              # App id (JWT issuer for installation tokens + redelivery API)
LAT_GITHUB_APP_SLUG            # for the install URL github.com/apps/<slug>/installations/new
LAT_GITHUB_APP_PRIVATE_KEY     # PEM (base64-encoded in env), signs App JWTs
LAT_GITHUB_WEBHOOK_SECRET      # HMAC secret for X-Hub-Signature-256
LAT_GITHUB_APP_CLIENT_ID       # the GitHub App's OWN OAuth client (install-claim verification, 5.2).
LAT_GITHUB_APP_CLIENT_SECRET   #   MUST NOT reuse LAT_GITHUB_CLIENT_ID/_SECRET — those are the existing
                               #   GitHub SSO sign-in OAuth app (create-better-auth.ts); a different client.
LAT_GITHUB_BASE_URL            # optional, default https://github.com — set to a GHES host to point
                               #   every constructed URL at it (API base derived: api.github.com for
                               #   github.com, {base}/api/v3 for GHES)
```

API usage is deliberately tiny: `GET /user/installations` (claim check, user token, once), `GET /app/installations/{id}` (claim metadata, App JWT), `GET /installation/repositories` (repo picker), `GET /repos/{owner}/{repo}/compare/{before}...{after}` (oversized pushes only, commit messages only — **never file contents**), `POST /app/hook/deliveries/{id}/attempts` (redelivery sweep, Phase 5). Installation tokens are minted on demand and cached in Redis (`org:${organizationId}:github:installation-token:${installationId}`, TTL 55m — tokens live 60m); nothing GitHub-issued is stored in Postgres.

### 5.2 Install / claim / disconnect

Mirrors the Slack OAuth routes (`apps/web/src/routes/integrations/slack/*`), hardened per GitHub's setup-URL warning:

1. **Connect** (settings page, org admin): server fn mints a nonce, stores `org:${organizationId}:github:install-state:${nonce}` in Redis (TTL 10m, value = orgId + userId), 302 to `https://github.com/apps/${LAT_GITHUB_APP_SLUG}/installations/new?state=${nonce}`.
2. **Setup callback** (`apps/web/src/routes/integrations/github/setup/callback.ts`): receives `installation_id`, `setup_action`, `state`, and — because "Request user authorization during installation" is on — an OAuth `code`. The handler:
   - validates `state` against Redis (consumes the nonce; mismatch → error page);
   - exchanges `code` for a **user token** (used once, never stored) and calls `GET /user/installations` to verify `installation_id` belongs to the installing user — this is the documented defense against spoofed `installation_id` redirects;
   - fetches the installation via App JWT (`GET /app/installations/{id}`) for account metadata;
   - runs `claimGithubInstallationUseCase`: inserts the `integrations` parent (`kind: "github"`, `vendor_account_id: String(installation_id)`), the `github_integration_details` child, and the org-default `github_sync_configs` row (seeded with the built-in defaults, 5.4) in one transaction. The partial unique on `(kind, vendor_account_id) WHERE revoked_at IS NULL` enforces one installation ↔ one org; claiming an installation already active elsewhere fails with a clear error.
3. **Installation webhooks** maintain the claimed row: `installation.deleted` → soft-revoke the parent (configs stay, processing stops, links kept for history — D8); `suspend`/`unsuspend` → toggle `suspended_at`; `installation_repositories.removed` / `new_permissions_accepted` → refresh details metadata and flag orphaned repo configs in the UI. Events for **unclaimed** installations are acked and dropped (install must start from Latitude).
4. **Disconnect** (settings): soft-revoke locally; link rows and history are kept; a banner explains the app can also be uninstalled on GitHub (which triggers the same revoke via webhook).

### 5.3 Data model

Four new tables (plus the existing `integrations` parent), all under `latitude.`, no FKs, `organizationRLSPolicy` on each, application-enforced integrity (house rules). Naming is vendor-prefixed like `slack_*`.

```
latitude.integrations                        (EXISTS — add kind "github")
  vendor_account_id = GitHub installation_id (stringified)

latitude.github_integration_details          (NEW — 1:1 child of integrations; pure installation state,
  integration_id (PK), organization_id,       no settings here — config has one home: github_sync_configs)
  installation_id bigint, account_login, account_type,     -- Organization | User
  repository_selection,                                    -- all | selected
  suspended_at timestamptz,
  created_at, updated_at

latitude.github_sync_configs                 (NEW — org-default row + per-project repo rows,
  id, organization_id, project_id,            the agent_dispatch_configs single-table cascade)
  integration_id,
  -- project_id IS NULL → THE org-default row: repo fields NULL, behavior fields NOT NULL
  --   (seeded with the built-ins at claim time)
  -- project_id set    → a monitored repo+branch: repo fields set, behavior fields NULL → inherit
  repo_id bigint, repo_full_name,            -- numeric id is rename-stable; full_name is a cached label
  branch,                                    -- seeded with the repo's default branch at creation
  enabled boolean NOT NULL DEFAULT true,
  monitor_pull_requests boolean,             -- NULL → inherit org default
  monitor_commits boolean,                   -- NULL → inherit
  sources jsonb,                             -- NULL → inherit
  rules jsonb,                               -- NULL → inherit (replaced wholesale when set)
  created_at, updated_at
  UNIQUE (integration_id) WHERE project_id IS NULL          -- one org-default row (dispatch precedent)
  UNIQUE (project_id, repo_id, branch) WHERE project_id IS NOT NULL
  INDEX (organization_id, repo_id)           -- webhook-side lookup

latitude.github_signal_links                 (NEW — the N:M link, one row per signal × PR/commit;
  id, organization_id, project_id,            this is the product entity: the pill reads it, the dedup
  signal_id, integration_id,                  uniques live on it, the action provenance is recorded on it)
  repo_id bigint, repo_full_name,
  link_type,                                 -- pull_request | commit
  pr_number int,                             -- pull_request only
  pr_state,                                  -- draft | open | merged | closed (pull_request only)
  commit_sha, push_after_sha,                -- commit only; push_after_sha powers rebase absorption (5.9)
  title,                                     -- PR title / commit message first line (cached label)
  url,                                       -- html_url, target of the UI pill
  author_login,
  matched_sources jsonb,                     -- ["pr_title","branch_name",...] for provenance display
  action,                                    -- resolve | unresolve | reference (strongest matched intent)
  action_applied_at timestamptz,             -- when the lifecycle command actually ran (NULL until merge)
  merged_at timestamptz,                     -- PR merge / commit push time
  created_at, updated_at
  UNIQUE (organization_id, signal_id, repo_id, pr_number) WHERE link_type = 'pull_request'
  UNIQUE (organization_id, signal_id, repo_id, commit_sha) WHERE link_type = 'commit'
  INDEX (organization_id, signal_id)         -- detail-page read
  INDEX (organization_id, repo_id, commit_sha), INDEX (organization_id, repo_id, pr_number)

latitude.github_deliveries                   (NEW — idempotency claim + audit/debug surface; merged-PR
  id, organization_id, integration_id,        rows double as the push↔PR attribution record, 5.9)
  delivery_id,                               -- X-GitHub-Delivery GUID
  event, action, repo_id bigint,
  status,                                    -- processed | skipped | failed
  skip_reason, error_category, error_detail,
  truncated boolean NOT NULL DEFAULT false,  -- push commits[] hit the cap and the API walk didn't cover it
  pr_number int, merge_commit_sha, head_sha, -- stamped on processed merged-PR deliveries only (5.8 ①);
                                             --   the attribution join keys — no separate merges table
  received_at, processed_at
  UNIQUE (delivery_id)
  INDEX (organization_id, repo_id, merge_commit_sha) WHERE merge_commit_sha IS NOT NULL
  INDEX (organization_id, repo_id, head_sha) WHERE head_sha IS NOT NULL
```

Why `github_signal_links` cannot be "just a query over `github_deliveries`": deliveries are an append-only raw-event ledger — deriving links from them at read time would mean re-running the matcher on every page load, with no uniqueness to dedupe against, no `pr_state` lifecycle to update, no recompute-on-edit semantics, and no durable record of *which action was applied and when*. The link row is the product entity; the delivery row is the audit trail. Everything else (`github_pr_merges` from the earlier draft) folds into the deliveries table as three nullable stamped columns.

Idempotency is layered (mirrors `agent_dispatches` + `slack_deliveries`): the **delivery claim** (`INSERT … ON CONFLICT (delivery_id) DO NOTHING RETURNING`; losing claim = already processed, ack) plus the **per-link unique constraints** plus the **idempotent lifecycle commands** — a redelivered event converges to the same end state at every layer. Retention: a repeatable job prunes `github_deliveries` older than 30 days (attribution needs seconds; manual redeliveries happen within days).

### 5.4 Configuration: org defaults + project overrides

Configuration has **one home**: `github_sync_configs`, using the exact `agent_dispatch_configs` single-table cascade — the **org default is the `project_id IS NULL` row** (one per integration, unique-indexed, seeded with the built-ins at claim time), and each **project repo row** inherits per field: `NULL → inherit` or set → **replace wholesale** (no deep merge — an overridden `rules` object replaces the whole rules object, keyword lists included), resolved by a pure `resolveEffectiveSyncConfig` helper (`resolve-effective-config.ts` precedent). `github_integration_details` stays pure installation state — Slack's `routes` jsonb on its details table is Slack-specific channel routing, not a config-cascade precedent; the dispatch table shape is.

```ts
export const githubMatchingRulesSchema = z.object({
  resolveKeywords: z.array(z.string().min(1).max(64)).max(64),
  unresolveKeywords: z.array(z.string().min(1).max(64)).max(64),
  referenceKeywords: z.array(z.string().min(1).max(64)).max(64),
})

export const githubMonitorSettingsSchema = z.object({
  monitorPullRequests: z.boolean(),                 // default true
  monitorCommits: z.boolean(),                      // default true
  sources: z.object({
    commitMessage: z.boolean(),                     // default true
    branchName: z.boolean(),                        // default true
    prTitle: z.boolean(),                           // default true
    prBody: z.boolean(),                            // default true
  }),
  rules: githubMatchingRulesSchema,
})
```

Built-in default keywords (case-insensitive; multi-word entries match as phrases):

| Action | Keywords |
| --- | --- |
| **resolve** | close, closes, closed, closing, fix, fixes, fixed, fixing, resolve, resolves, resolved, resolving, complete, completes, completed, completing, implement, implements, implemented, implementing, address, addresses, addressed, addressing, solve, solves, solved, solving |
| **unresolve** | reopen, reopens, reopened, reopening, revert, reverts, reverted, reverting, roll back, rolls back, rolled back, rolling back, back out, backs out, backed out |
| **reference** | ref, refs, references, part of, related to, relates to, contributes to, toward, towards |

A "Reset to defaults" affordance restores the built-in lists (stored settings always contain the full materialized lists, so later changes to the built-ins don't silently mutate existing orgs).

### 5.5 Reference matching engine

A pure, exhaustively-tested domain module (`@domain/github` `matching/`), independent of webhooks: `matchTexts(inputs: { source, text }[], rules) → { slug, action, sources }[]`.

**Stage 1 — candidate extraction** (permissive by design; a per-project slug lookup gates every candidate, so false candidates like `PRE-2024` cost one indexed lookup and match nothing):

- Candidate token: `#?<3 alpha>-<4 alnum>` (the exact shape `generateSignalSlug` produces), matched **case-insensitively** (branch names are lowercase by convention: `fix/lat-xy9z-timeouts`), uppercased before lookup.
- Boundaries: the characters immediately before and after must be non-alphanumeric (hyphens allowed as boundaries, so `feature-lat-xy9z` and `lat-xy9z-timeouts` both match, while the `lat-xy9z` inside `flat-xy9z…` does not).
- Input caps: each source text is truncated to 65,536 chars before scanning (the PR-body maximum; commit messages above it are pathological).

**Stage 2 — action classification**, per candidate:

- Text is split into **segments**: lines, then sentences within lines (`.`, `;`, `!`, `?` terminators). Branch names are a single segment in which `/`, `_`, and `.` count as token separators.
- Keywords are matched word-bounded and case-insensitively inside the candidate's segment, before **or** after the slug — this is what makes `Fixes LAT-XY9Z`, `fixes: #LAT-XY9Z`, `LAT-XY9Z is fixed`, and `Fixed LAT-XY9Z and LAT-AB12` (keyword distributes over every slug in its segment) all work, unlike GitHub's adjacency-only rule.
- When multiple categories hit one segment, precedence is **unresolve > resolve > reference** — so `Revert "Fix LAT-XY9Z timeouts"` classifies as unresolve.
- **No keyword in the segment → no match.** A slug alone never links anything; every link requires a resolve, unresolve, or reference keyword in the slug's segment.
- Per slug, the strongest action across all segments and sources wins.

**Stage 3 — signal resolution**: for each repo config matching the event, uppercase the slug and `findBySlug({ projectId: config.projectId, slug })`. Unknown slug → dropped. Soft-deleted signals never match (repository contract). Multiple projects bound to the same repo each resolve independently — one PR can link signals across projects, and identical slugs in two projects (possible: prefixes derive from project slugs) each link their own signal.

The result is a set of `(signalId, action, matchedSources)` tuples per event per config.

### 5.6 Keyword customization — no user regex

Customization is deliberately **keyword lists only** — users edit words/phrases per action, never patterns. This removes an entire threat and complexity class:

- **Validation** (settings use-case): each keyword 1–64 chars, ≤ 64 keywords per list, letters/digits/spaces/hyphens only (a phrase like `part of` is one keyword), deduplicated case-insensitively, and no keyword may match the slug shape itself.
- **Execution**: keywords are **regex-escaped literals** compiled into a word-bounded alternation by our own code — user input never reaches regex syntax, so there is no ReDoS surface, no pattern linter, and no special engine; native `RegExp` over the capped inputs (5.5) is safe by construction.
- **User-supplied regex patterns are explicitly not shipped** (D6). If demand appears, the research is banked: the safe design is GitLab-style — patterns compiled and executed under RE2 semantics (`re2js`: MIT, pure JS, linear-time), length-capped, validated at save time. That lands as its own future addition without reshaping this schema (`rules` is jsonb; a `customPatterns` key can be added later).

### 5.7 Webhook receiver

`POST /webhooks/github` in **apps/api** (`apps/api/src/routes/webhooks-github.ts`), mounted on the top-level app **before** the auth wall, exactly like `bootstrap.ts`/`health.ts` (`createRoute`, `security: PUBLIC_SECURITY`, `"x-fern-ignore": true`, its own rate limiter). The receiver is deliberately dumb and DB-free:

1. Read the **raw body** (GitHub caps payloads at 25MB; set the route body limit accordingly) and verify `X-Hub-Signature-256` with a constant-time HMAC-SHA256 check modeled on `verifySlackSignature` (`@platform/github` `verifyGithubSignature`). Invalid/missing → 401, nothing enqueued.
2. Route by `X-GitHub-Event`: `ping` → 200; `pull_request` (actions `opened`, `edited`, `reopened`, `closed`, `ready_for_review`, `converted_to_draft`), `push`, `installation`, `installation_repositories` → enqueue; anything else → 202 drop.
3. **Slim-extract** before enqueueing (BullMQ payloads live in Redis; never enqueue a raw 25MB push):
   - `pull_request`: delivery id, installation id, repo (`id`, `full_name`), action, PR `number`, `title`, `body`, `state`, `draft`, `merged`, `merge_commit_sha`, `merged_at`, `head.ref`/`head.sha`, `head.repo.id` (fork detection), `base.ref`, `html_url`, `user.login`, `author_association` (trust gate, 5.8), and `changes.base` when present (retarget detection).
   - `push`: delivery id, installation id, repo (`id`, `full_name`, `default_branch`), `ref`, `before`/`after`, `created`/`deleted`/`forced`, and per commit: `id`, `message` (each capped at 16KiB), `timestamp`, `author.username|name`, `url`. Commits are capped at **200 per push** for matching; if `commits.length` exceeds the cap (or hit GitHub's 2048 truncation), the payload is flagged `truncated` for the worker to complete via the compare API (Phase 5; until then the ledger row records the truncation — no silent caps).
   - `installation` / `installation_repositories`: delivery id, installation id, action, account login/type, repository_selection.
4. Publish to the `github-events` queue (tasks `pull-request`, `push`, `installation`) with `dedupeKey: github:${deliveryId}`, `attempts: 5`, exponential backoff (30s base). Push jobs are additionally scheduled with the **10s grace delay** (5.9). Respond **202 immediately** — well inside GitHub's 10s window.

### 5.8 Event processing

One worker (`apps/workers/src/workers/github-events.ts`), three handlers. Common preamble for `pull-request` and `push`: resolve `installation_id` → active claimed integration (unclaimed/suspended/revoked → ack + drop) → org; claim the delivery ledger row; load enabled `github_sync_configs` project rows for `(organization_id, repo_id)` and resolve each against the org-default row (5.4). No matching config → `skipped` ledger row.

**`pull-request` handler** — for each config with effective `monitorPullRequests` and `base.ref === config.branch`:

| Action | Behavior |
| --- | --- |
| `opened` / `reopened` / `ready_for_review` / `converted_to_draft` | Run the matcher over the enabled PR sources (`prTitle`, `prBody`, `branchName` = `head.ref`). Upsert one `github_signal_links` row per matched signal (`pr_state` from `draft`/`state`, `action` = strongest intent, `action_applied_at` NULL). |
| `edited` | Re-run the matcher and **recompute** the PR's link set for this project: add newly matched signals; delete links that no longer match **unless** `action_applied_at` is set (an applied action's provenance is never deleted). Retargets (`changes.base`) re-evaluate the branch gate: onto the configured branch → process as `opened`; off it → delete unapplied links. |
| `closed`, `merged: false` | Set `pr_state: "closed"` on the PR's links. No action ever applies. |
| `closed`, `merged: true` | ① Stamp the merge join keys (`pr_number`, `merge_commit_sha`, `head_sha`) onto this delivery's ledger row (always — even for PRs with zero matches; this powers push attribution, 5.9). ② Set `pr_state: "merged"`, `merged_at`. ③ **Apply actions** (5.10) for every linked signal with intent resolve/unresolve. ④ **Absorb** any standalone commit links this merge explains (5.9). ⑤ **Revert convention**: if the PR body matches GitHub's auto-generated `Reverts <owner>/<repo>#<number>` and PR `#number` has links with an applied resolve, apply unresolve to those signals and record unresolve links on the reverting PR. |

**Fork-PR trust gate** (D13): on public repos anyone can open a PR whose text names a slug. Pre-merge link creation (`opened`/`edited`/`reopened`/…) therefore requires the PR to be same-repo (`head.repo.id === repo.id`) **or** authored with standing (`author_association ∈ {OWNER, MEMBER, COLLABORATOR}`). Untrusted fork PRs are ignored pre-merge and get their links (and actions) at merge time — merging requires write access, which is the trust event, mirroring GitHub's own model where closing keywords take effect on merge. This bounds the drive-by surface to zero: an outsider's PR cannot even create a link until a maintainer merges it.

Post-merge `edited` events update links (recompute additions) but **never** apply actions — actions fire exactly once, at merge time, on the link set of that moment (D10; matches GitHub, where editing a merged PR doesn't close issues).

**`push` handler** — for each config with effective `monitorCommits` and `ref === refs/heads/${config.branch}`; skip `deleted` pushes:

1. **Attribution check** (only when `monitorPullRequests` is also on — with PRs off there is nothing to duplicate): the push belongs to a PR merge if `after` or any `commits[].id` matches a stamped merged-PR delivery row (or an existing PR link) for this repo by `merge_commit_sha` or `head_sha`. A ref update is atomic per operation, so an attributable push is *entirely* that PR's merge — merge-commit merges (branch commits + merge commit), squashes (one commit), and rebases (N rebased commits, `after == merge_commit_sha`) are all covered by the three-key check.
2. **Attributed push** → fold into the PR: run the matcher over the commit messages (`commitMessage` source) and upsert any matches as **PR links** on the attributed PR (GitHub parity: a squash commit's body carries the inner commit messages, and commits landing on the default branch close issues), applying actions idempotently since the PR is merged. No commit links are created.
3. **Unattributed push** → standalone commits: per commit, run the matcher on the message; upsert `github_signal_links` rows (`link_type: "commit"`, `push_after_sha: after`, `merged_at`: commit timestamp) and **apply actions immediately** — a commit on the configured branch is already "merged".
4. The 10s **grace delay** (5.7) exists only to let the `pull_request closed` delivery win the race in the common case; correctness never depends on it (5.9).

**`installation` handler** — maintains the claimed integration per 5.2.

Signal-side interplay comes free: auto-resolve emits `SignalEscalationEnded(reason: "resolved")` closing open incidents silently; if the signal recurs, the shipped regression path (`SignalRegressed`) reopens it and can re-dispatch an agent — the full loop.

### 5.9 PR/commit dedup — merge attribution

The problem: a merged PR produces **two** deliveries — `pull_request closed` and the base-branch `push` containing the merge result — in no guaranteed order, and the push's commit messages often repeat the PR's magic words (squash messages embed the PR title and inner commit messages). Without care, one merge yields a PR link *and* a spurious commit link, and double-applies actions (harmless — commands are idempotent — but the duplicate link is wrong).

Resolution is **signal-granular and order-independent**:

- **Join keys**, stamped on the delivery ledger row of *every* processed merged-PR event on a monitored repo (`github_deliveries.{pr_number, merge_commit_sha, head_sha}` — no separate table): per GitHub's documented semantics these identify the merge push under all three merge methods: merge commit (push contains `merge_commit_sha` and `head_sha`), squash (single commit = `merge_commit_sha`), rebase (`push.after == merge_commit_sha`).
- **PR event first** (common case, helped by the 10s push delay): the push arrives attributed → folded into the PR (5.8 step 2). No duplicate ever exists.
- **Push first** (late/lost PR delivery): standalone commit links are created. When the `pull_request closed` event arrives, the **absorb step** runs: delete commit links on the same signal whose `commit_sha ∈ {merge_commit_sha, head_sha}` **or** whose `push_after_sha == merge_commit_sha` (this last clause catches every intermediate commit of a rebase merge — they share the push's `after`), and let the PR link carry the union of their `matched_sources` and any already-applied action's `action_applied_at`. Net state is identical to the PR-first ordering.
- **Actions stay single-application in effect**: `applySignalLifecycleCommand` is an idempotent timestamp toggle, so PR-then-push (or push-then-PR) double application is a `changed: false` no-op. The ledger and link rows always show which side actually flipped the signal.
- A commit matching a signal the PR *didn't* match (e.g. a squash body mentions `LAT-AB12` but the PR text doesn't) is **not** a duplicate: attribution folds it into the PR as a PR link, preserving the resolution.
- `commits[].distinct` is deliberately **not** used: attribution supersedes it, and honoring it would silently drop fast-forward pushes of previously-pushed commits (a real PR-less workflow).

### 5.10 Action semantics

- Actions apply through the shipped `applySignalLifecycleCommandUseCase`, batched per `(project, command)`: matched resolves in one `resolve` call, unresolves in one `unresolve` call. `keepMonitoring` is omitted → the project→org→system `resolveSettings` cascade decides, same as a human resolving without touching the toggle.
- **reference** intent never mutates the signal — it only creates the link row.
- **unresolve precedence**: when one merge matches both resolve and unresolve for the same signal (across segments/sources), unresolve wins (5.5); a merge that reverts is never treated as a fix.
- The integration never ignores, unignores, mutes, or unmutes.
- Attribution gap accepted (D7): the signal itself records no actor (parity with the whole lifecycle system); provenance lives on the link row (`action`, `action_applied_at`, `url`, `author_login`) and is rendered in the UI. If a platform-wide actor concept lands later (`specs/signal-resolve-ignore.md` D10's "revisit"), the link row already carries everything needed to backfill.
- Resolving an already-resolved signal, unresolving an open one, or acting on a soft-deleted/ignored signal are all safe no-ops (`changed: false`); ignored signals still get links (visible on the detail page) but per lifecycle rules an unresolve on an ignored signal only clears `resolvedAt` — it does not unignore.

### 5.11 Signal detail UI

A **GitHub links pill**, rendered **first** in the detail-page header actions — before `SignalSendTo`, `SignalTriageControls`, `SignalLifecycleActions` (`.../signals/$signalSlug/index.tsx`). Component: `.../$signalSlug/-components/signal-github-links.tsx`, following the sibling `-components/` convention and **cloning the anatomy of `signal-dispatch-history.tsx`** (PR #4182), which is the shipped precedent for exactly this "pill summarizing the latest item, popover listing the history" pattern:

- **Hidden when the signal has no links** (no empty-state pill; the integration announces itself in settings, not here).
- **Pill** (dispatch-history trigger style): outline `sm` `Button` with the GitHub mark + primary link label + `Status` chip. The primary link is chosen by: PRs beat commits; among PRs, the last merged, else the most recently updated; among commits, the most recent. Label: `#<number>` for PRs, short SHA for commits. `Status` variants GitHub-familiar: open (success), draft (neutral), merged (info/purple family), closed (destructive/muted).
- **Exactly one link** → the pill is a plain anchor: click opens the PR/commit `html_url` in a new tab (`target="_blank" rel="noreferrer"`). No popover.
- **More than one** → the pill gains a `+N` suffix and opens a `Popover` structured like `SignalDispatchHistory`: `modal={false}`, `align="end"`, `max-w-72 p-2`; header row with the title ("Linked pull requests & commits") and a "View all" link to the GitHub manage page (deliveries table); `max-h-80` scrollable `divide-y` row list, PRs first (recency-sorted), then commits. Each row is an `<a target="_blank">` (dispatch-history `DispatchRow` layout): state `Status` + title, `repo#number` / short SHA + author, muted `relativeTime` meta line, and the applied action when present ("Resolved this signal" / "Reopened this signal").
- Data: a `listSignalGithubLinks` server fn + collection entry (the `listSignalDispatches` fn added in #4182 is the direct template: id-keyed detail query loaded with the page, no layout shift for the common zero-link case).
- Gated by the feature flag; no rendering (not even fetch) when off.

### 5.12 Settings UI

All under the existing project-scoped settings tree, next to Slack and agent dispatch:

1. **`settings/integrations/index.tsx`** gains a `GithubIntegrationSection` card (reuses `integration-card.tsx`): connect state, account login/avatar, repo-selection summary, Connect / Manage / Disconnect. Hidden without the feature flag or when `LAT_GITHUB_APP_*` env is absent.
2. **Manage page** — new static route `settings/integrations/github.tsx` (static beats the `$integrationKind` dynamic sibling in TanStack route ranking):
   - **Connection**: account, installation status (active / suspended), uninstall pointer.
   - **Organization defaults** (edits the org-default `github_sync_configs` row; org-wide copy: "these defaults apply to every project"): monitor toggles, source toggles, and the **magic words editor** — three keyword chip-lists (resolve / unresolve / reference: add/remove, reset-to-defaults, inline validation errors via the standard `useForm` + `fieldErrorsAsStrings` pattern).
   - **This project's repositories**: list of the project's `github_sync_configs` rows — add repo (picker fed by `listInstallationRepositories`, cached `org:${organizationId}:github:repos:${installationId}` TTL 5m), branch (default branch pre-selected), enabled toggle, and an "Override defaults" expander that reuses the defaults form in override mode with per-field inherit/replace and a "Reset to organization defaults" action (`project-dispatch-overrides.tsx` is the precedent).
   - **Recent deliveries** (debug/audit table over `github_deliveries`, newest first: event, action, repo, status, skip/error reason) — the dispatch-history precedent; invaluable for "why didn't my commit resolve the signal".

### 5.13 Security and tenancy

**Cross-organization isolation — the load-bearing invariant.** A slug is just text; anyone on the internet can type `Fixes LAT-XY9Z` into any PR on any repo. What makes that harmless is that **slug resolution is reachable only through a chain in which every hop is bound to one organization by an authenticated act of that organization**:

```
signed delivery (HMAC, app secret)
  → installation_id                     GitHub-asserted, spoof-proof (signed payload)
  → claimed integration                 claim required org-admin session + OAuth proof the installer
  |                                       owns the installation (5.2); partial unique = one org, ever
  → that org's github_sync_configs      created by that org's members, for repos of their installation
     for (organization_id, repo_id)
  → config.projectId                    a project of that same org
  → findBySlug({ projectId, slug })     per-project unique index; RLS on top
```

Consequences, stated as guarantees:

- **A slug from org B written anywhere can never touch org B's signals unless the event originates from org B's own claimed installation on a repo org B itself configured.** Events from unconfigured repos die at the config lookup — no slug is ever parsed for them. Events from org A's repos resolve slugs exclusively inside org A's bound projects; if org A coincidentally has an identical slug, the match is org A's *own* signal (their repo, their config, their merge) — org B is unreachable by construction.
- **A repo can only ever feed one organization.** A repository belongs to exactly one GitHub account, an account holds at most one installation of the app, and an installation is claimable by at most one Latitude org (partial unique on `(kind, vendor_account_id) WHERE revoked_at IS NULL`) — so there is no event fan-out across orgs to even reason about.
- **Binding a repo you don't control is inert.** `upsertGithubSyncConfig` validates server-side that `repo_id` belongs to the org's own installation (checked against `listInstallationRepositories`, not client input). Even without that check the config would never fire — event routing goes installation → org *first*, so a rogue `repo_id` row in org A is never consulted for org B's deliveries — but the validation keeps the config surface honest and the UX truthful.
- **Mutations additionally require repo write access on GitHub.** Resolve/unresolve fire only on merge to the configured branch (or a direct push to it) — acts gated by GitHub's own permission model on the customer's repo. Drive-by *links* from fork PRs are gated too (the trust gate, 5.8/D13). The worst a malicious outsider can achieve against an org monitoring a public repo is nothing at all until a maintainer of that repo merges their text.
- **RLS backs the whole chain**: every table is org-scoped; the worker enters an org's scope only after the installation → claimed-integration hop; server fns go through `requireSession` + org scoping like every sibling.

Remaining security properties:

- **Zero write access to customers' GitHub**: three read-only permissions; the app cannot comment, push, or change anything. Contents:read is the unavoidable cost of `push` events; the worker only ever reads commit *messages* via the compare API — never file contents.
- **Webhook authenticity**: constant-time HMAC-SHA256 over the raw body; unsigned/invalid → 401 before any parsing side effects. `X-GitHub-Delivery` claims give replay/redelivery idempotency.
- **Installation claim** is spoofing-resistant per GitHub's own guidance (5.2): Redis-nonce `state` + OAuth user-token verification, plus the signed `installation` webhooks as the ongoing source of truth. Claims of an installation active in another org fail on the partial unique.
- **Redis keys** follow `org:${organizationId}:github:*` (install state, repo cache, installation tokens).
- **No user-supplied regex exists** (5.6): keywords are escaped literals with length/count caps compiled by our own code — no ReDoS surface at all.
- **No per-org GitHub secrets at rest**: App credentials are platform env vars; installation tokens are short-lived and cached only in Redis.
- The public receiver is rate-limited (global limiter, `bootstrap.ts` precedent) and enqueues at most one job per valid signed delivery.

### 5.14 Failure policy

| Failure | Where | Action |
| --- | --- | --- |
| Invalid/missing signature | receiver | 401, drop. Counted by the rate limiter. |
| Unhandled event/action type, `ping` | receiver | 2xx, drop (no queue traffic). |
| Unknown/unclaimed installation | worker | Ack + drop (no ledger row — no org to scope it to). |
| Suspended/revoked integration | worker | Ack; ledger `skipped(suspended)`. |
| No matching repo config / branch | worker | Ack; ledger `skipped(no-config)`. |
| Transient DB/queue errors | worker | Propagate → BullMQ retry (5 attempts, exp backoff); delivery claim keeps retries idempotent. |
| GitHub API 401/403 (App creds) | worker / server fns | Ack; ledger `failed(auth)`; settings surfaces "check app credentials" (self-host misconfig). |
| GitHub API 429 | worker | Retry honoring `Retry-After`. |
| GitHub API 5xx / network | worker | Retry with backoff. |
| Push `commits[]` over cap | worker | Until the compare-API walk ships (Phase 5): process the included commits, mark ledger `truncated: true` — never silently. |
| Missed deliveries (our downtime) | — | GitHub does not auto-retry. Phase 5 ships the redelivery sweep (`GET /app/hook/deliveries` → `POST …/attempts` for failed ones, hourly repeatable). Until then: manual redelivery from the GitHub App dashboard; all processing is idempotent. |

### 5.15 Self-hosting

- Self-hosters register **their own GitHub App** (BYO, consistent with the bring-your-own policy in `AGENTS.md`): docs walk through the registration (permissions, events, URLs from 5.1) and the `LAT_GITHUB_*` env vars. When unset, the integration is invisible — zero bundled dependency on GitHub.
- All new infra is namespaced: `latitude.` tables, `github-events` queue in the existing registry, `org:`-prefixed Redis keys.
- No new runtime dependencies.
- **GitHub Enterprise Server, best-effort** (Q5): since nothing in the design hard-codes `github.com` beyond URL construction, the optional `LAT_GITHUB_BASE_URL` env var ships in the MVP — all web/API/OAuth URLs are built from it (API base derived as `{base}/api/v3` for non-github.com hosts). A GHES self-hoster registers their app on their GHES instance exactly as in P1-0. Best-effort: not exercised against a real GHES in the MVP QA matrix.

### 5.16 Agent-dispatch handshake

Agent dispatch and this integration are the two halves of one loop, and today the dispatched agent doesn't know the convention that would make its PR matchable — the default prompt (`renderDefaultPrompt` in `packages/domain/agent-dispatch/src/helpers/render-prompt.ts`) names the signal's internal `id` but **never renders the slug**, even though `AgentDispatchContext.signal.slug` already carries it (`build-dispatch-context.ts:299`). This subsection fixes the handshake so the loop closes hands-free:

```
signal escalates → agent dispatched (prompt carries slug + convention)
  → agent works on branch  fix/lat-xy9z-timeout-handling      (keyword + slug → links via the PR)
  → agent opens PR         "Resolves LAT-XY9Z: <fix summary>" (resolve intent → links on open)
  → signal page shows the open PR pill while the fix is in review
  → maintainer merges → signal auto-resolved → regression watch takes over
```

Changes in `@domain/agent-dispatch` (shipped as part of this spec, Phase 3):

- **Render the slug**: the signal line becomes `Signal: {name} ({source})   Ref: {slug}` (keep `ID:` for MCP calls if useful, but the slug is the human/git-facing reference).
- **Add the convention block** to both signal-trigger prompt branches (`signal.discovered`/`incident.opened` and `signal.regressed`; monitor prompts are untouched — monitors have no signal lifecycle to drive):

  ```
  Work on a branch named "fix/{slug-lowercase}-<short-description>" (e.g. "fix/lat-xy9z-timeout-handling").
  Title the PR "Resolves {SLUG}: <short fix summary>" and include the line "Resolves {SLUG}"
  in the PR description. Latitude links the PR to the signal from these references and resolves
  the signal automatically when the PR merges into the monitored branch.
  ```

  Exact copy is finalized at implementation with the Phase 2 golden matcher suite as the contract: the branch, title, and description forms must each produce a resolve intent under the **default** rules (a slug alone never links — 5.5).
- The closing guard line stays and gets sharper: "Do not resolve the signal via Latitude tools — merging the PR resolves it automatically; a human verifies after deploy."
- **Unconditional by design** (Q8, confirmed): the convention block renders whether or not the org has GitHub connected — slug-branded branches/titles are useful to human reviewers regardless, and keeping the producer ignorant of GitHub config avoids coupling `@domain/agent-dispatch` to `@domain/github`.
- **Custom templates don't update themselves**: configs with a `promptTemplate` override keep their text. The exported `defaultDispatchPromptTemplate` seed (shown in the settings UI as the customization starting point) gains the same block with `{{signal.slug}}`, and the settings UI shows a one-line hint under the template editor ("Include {{signal.slug}} with a resolve keyword so merged PRs auto-resolve the signal"). `dev-docs/agent-dispatch.md` documents the handshake.

## 6. Edge cases

| Case | Behavior |
| --- | --- |
| Squash merge whose message embeds inner commit messages with magic words | Push is attributed to the PR → matches fold into **PR links**; no duplicates (5.9). |
| Rebase merge (N new SHAs) | `push.after == merge_commit_sha` attributes the whole push; late-PR-event stragglers absorbed via `push_after_sha`. |
| Merge-commit merge of a fork PR (branch commits new to the repo) | Push contains merge commit → attributed as a whole; branch-commit messages fold into the PR. |
| Push event arrives before the PR `closed` event | 10s grace delay usually reorders; otherwise commit links are created and absorbed when the PR event lands (5.9). |
| PR merged, description edited afterwards to add `Fixes LAT-…` | Link created; **no action** applied (D10). |
| PR retargeted onto / off the configured branch | `edited` + `changes.base` re-runs the branch gate (5.8). |
| PR closed without merging, later reopened | Links persist through `closed` → `open` state flips; actions only ever on merge. |
| GitHub's auto-revert PR (`Reverts owner/repo#123`) | Unresolves the signals PR #123 resolved, even without a slug in the revert text (5.8 step ⑤). |
| Same slug text in two bound projects | Each project's config resolves its own signal; both link (5.5). |
| A slug belonging to **another Latitude org** typed in a PR/commit | Resolves to nothing (or to the processing org's own identically-slugged signal); the other org is structurally unreachable — see the isolation invariant (5.13). |
| Fork PR from an outsider containing a slug, on a monitored public repo | No pre-merge link (trust gate, 5.8/D13); links + actions only if a maintainer merges it. |
| Signal renamed | Slug is stable — links and future matches unaffected. |
| Signal soft-deleted / slug reused by a new signal | Old links keep pointing at the old signal id (hidden with it); new matches resolve to the new slug owner. |
| Force push to the configured branch | Processed normally (`forced: true` noted on the ledger); existing links keyed by SHA may point at rewritten-away commits — accepted, links are historical records. |
| Branch deletion push (`deleted: true`) | Skipped. |
| Fast-forward push of commits previously pushed to another ref | Processed (attribution replaces the `distinct` heuristic precisely so this PR-less flow isn't dropped, 5.9). |
| Monorepo: one repo bound to N projects; multi-repo: one project bound to N repos | Both first-class via the `(project_id, repo_id, branch)` config shape. |
| Repo renamed on GitHub | `repo_id` is numeric and rename-stable; `repo_full_name` refreshes on the next event. |
| Project deleted | `ProjectDeleted` consumer deletes its repo configs and links (notifications-cascade precedent). |
| Installation suspended / app permissions re-accepted | Processing pauses / resumes via `installation` events; UI shows the state. |

## 7. Out of scope

- **Writing anything to GitHub** — PR comments ("this PR resolves signal…"), commit statuses, check runs. All require write permissions and would break the least-privilege promise. Revisit only as a separate opt-in permission tier.
- **Other forges** (GitLab, Bitbucket) — the vendor-prefixed table/package layout deliberately leaves room for parallel `gitlab_*` integrations later; nothing here is forge-generic prematurely.
- **Branch links as a first-class link type** (reacting to `create` events for branches named after slugs) — branch names reach us through PRs (D4).
- **Backfill** of already-merged PRs at config-creation time.
- **User-defined regex patterns** — dropped from the MVP (5.6/D6); if demand appears, ship under RE2 semantics (`re2js`) per the banked research, as a `customPatterns` key on the existing `rules` jsonb.
- **Notifications** — auto-resolve/unresolve emit no notification kind (Q2, product call). The signal page pill and the deliveries table are the visibility surfaces; the existing `SignalEscalationEnded` incident-close behavior is untouched.
- **GitHub-initiated installs** — claiming an installation started from GitHub's app/marketplace page (Q6); MVP installs begin in Latitude settings. A "claim pending installation" flow is the natural future extension.
- **Public REST/SDK/MCP surface** for links or config — UI leads (D11); a `getSignal` detail enrichment is future work with its own `pnpm generate:all` PR.
- **Signals-list column / filters** for linked PRs; command-palette entries.
- **Per-repo webhook mode** (customer-created webhooks instead of the App) — the App flow is strictly better for multi-tenant SaaS; self-hosters get their own App.

## 8. Resolved questions

All resolved with Alex, 2026-07-22. Kept for provenance; the resolutions are folded into the sections they touch.

1. **PRs/commits on non-configured branches** → **skip entirely** — no links, no actions, for both PRs targeting and commits pushed to non-configured branches (matches GitHub ignoring closing keywords off the default branch; already how 5.8 gates both handlers).
2. **Auto-resolve notification** → **none** — no new notification kind (moved to [Out of scope](#7-out-of-scope); the former optional Phase 5 task is dropped).
3. **`keepMonitoring` on auto-resolve** → **settings cascade** — identical to a human resolving without touching the switch (as 5.10 specifies).
4. **Grace-delay length** → **10s constant** (amended from 60s by Alex after reviewing the mechanism), tunable at implementation — an optimization only, never a correctness dependency (5.9/D9).
5. **GitHub Enterprise Server** → **ship the escape hatch now**: optional `LAT_GITHUB_BASE_URL` with derived API base, best-effort (5.15, P1-2); full GHES QA stays out of scope.
6. **Unclaimed installations** → **Latitude-initiated installs only** for the MVP; claiming GitHub/marketplace-initiated installs is future work ([Out of scope](#7-out-of-scope)).
7. **Fork-PR trust gate** → **`OWNER`/`MEMBER`/`COLLABORATOR` confirmed**; `CONTRIBUTOR` stays untrusted (D13).
8. **Handshake conditionality** → **unconditional confirmed** (5.16/D14).

## 9. Decisions

- **D1 — GitHub App, not customer-configured webhooks.** One app per environment, three read-only permissions (Pull requests, Contents, Metadata), app-level secret, per-installation payload routing. Least privilege, zero customer setup friction, token-less steady-state operation.
- **D2 — Reuse the `integrations` parent + child-details pattern** (`kind: "github"`, `vendor_account_id = installation_id`, partial-unique active claim), exactly as its schema comment anticipated. Org-level defaults live on the details row (Slack `routes` precedent); no per-org GitHub secrets are stored.
- **D3 — Config cascade mirrors agent dispatch**: org defaults + per-project repo configs with nullable-inherit / replace-wholesale fields, resolved by a pure helper. Repo bindings are `(project, repo_id, branch)` rows — N:N between projects and repos from day one.
- **D4 — Two link types: `pull_request` and `commit`.** Branch names are a *text source* (the PR head ref), not a link type.
- **D5 — Match loose, gate hard.** Permissive case-insensitive candidate extraction + segment-scoped keyword classification (position-agnostic, precedence unresolve > resolve > reference), gated by per-project slug lookup. GitHub's adjacency rule is the floor, not the ceiling.
- **D6 — Keyword lists only; no user-supplied regex.** Users customize words/phrases per action; keywords are escaped literals compiled by our own code, so the ReDoS class doesn't exist. The RE2/`re2js` design is banked for a future `customPatterns` addition if demand appears.
- **D7 — Attribution lives on the link row, not the signal.** The lifecycle system stays actor-less (parity with `specs/signal-resolve-ignore.md` D10); `github_signal_links` carries the full provenance and the UI renders it.
- **D8 — Links are historical records**: uninstall/disconnect/revert/force-push never delete applied links; only pre-merge recomputes (PR `edited`) remove unapplied ones.
- **D9 — Dedup = merge attribution + order-independent absorb** (5.9), keyed on `merge_commit_sha`/`head_sha` stamped on every merged-PR delivery row (no dedicated merges table) plus `push_after_sha` on commit links, with a 10s push grace delay as an optimization, never a correctness dependency. `commits[].distinct` is not used.
- **D10 — Actions fire exactly at merge time** on the then-current link set; PR-open links carry intent only; post-merge edits never mutate signals.
- **D11 — UI leads; no public API surface in the MVP** (signal-send-to R1 precedent) → no SDK/CLI/MCP regen in these PRs.
- **D12 — Feature-flagged rollout** (new registry flag), integration invisible without the flag + env credentials.
- **D13 — Cross-org isolation is structural, not filtered** (5.13): slug resolution is only reachable through signed delivery → OAuth-verified installation claim (one org, ever) → that org's own repo configs → that org's project. No global slug lookup exists anywhere in the pipeline. On top of that, mutations require a merge (GitHub write access) and pre-merge links require PR author standing (`author_association` / same-repo head) — untrusted fork PRs are invisible until merged.
- **D14 — Dispatched agents are taught the convention** (5.16): the default dispatch prompt renders the signal slug and instructs keyword-bearing branch names (`fix/{slug}-…`) and PR titles (`Resolves {SLUG}: …`), validated against the default matcher rules by the golden suite. Unconditional (no coupling to GitHub config presence — Q8); custom prompt templates opt in via the updated seed + settings hint.

## 10. Plan

Five phases, **one PR each** (repo convention: each phase maps to its own PR into `development`; branches from `origin/development`). Bottom-up within each phase so every layer typechecks before the next. New packages: `packages/domain/github` (`@domain/github`: entities, matching engine, ports, use-cases) and `packages/platform/github` (`@platform/github`: signature verify, App JWT + installation tokens, REST client). Suggested branch prefix: `github-integration/<scope>`.

## 11. Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — App foundation: install flow, receiver, worker skeleton

- [ ] **P1-0** *(manual — Alex)*: **register the GitHub Apps** (one for staging, one for production; repeat these steps twice). Latitude's GitHub org → **Settings → Developer settings → GitHub Apps → New GitHub App**:
  1. **GitHub App name**: `Latitude` (production) / `Latitude Staging`. **Homepage URL**: `https://latitude.so`.
  2. **Identifying and authorizing users** — **Callback URL**: `https://console.latitude.so/integrations/github/setup/callback` (staging: same path on the staging web host). Check **"Request user authorization (OAuth) during installation"** (required for the anti-spoofing claim check, 5.2). Leave "Expire user authorization tokens" checked (default; we use the token once).
  3. **Post installation** — **Setup URL**: the same callback URL as step 2. Check **"Redirect on update"**.
  4. **Webhook** — check **Active**. **Webhook URL**: `https://api.latitude.so/webhooks/github` (staging: `https://staging-api.latitude.so/webhooks/github`). **Secret**: generate a high-entropy random string (`openssl rand -hex 32`) — save it, GitHub won't show it again.
  5. **Repository permissions** (exactly three, all read-only): **Pull requests → Read-only**, **Contents → Read-only**, **Metadata → Read-only** (pre-set). Everything else stays "No access". No Organization/Account permissions.
  6. **Subscribe to events**: check **Pull request** and **Push** (Installation events are always delivered; they have no checkbox).
  7. **Where can this GitHub App be installed?** → **Any account** (customers install it on their own orgs).
  8. Create the app, then on its settings page: note the **App ID** and the **slug** (from the public link `github.com/apps/<slug>`), note the **Client ID**, click **"Generate a new client secret"**, and under Private keys click **"Generate a private key"** (downloads a `.pem`).
  9. **Hand over per environment** (to the deploy secrets store / `.env`): `LAT_GITHUB_APP_ID` (App ID), `LAT_GITHUB_APP_SLUG` (slug), `LAT_GITHUB_APP_PRIVATE_KEY` (the `.pem` contents, base64-encoded), `LAT_GITHUB_WEBHOOK_SECRET` (step 4 secret), `LAT_GITHUB_APP_CLIENT_ID`, `LAT_GITHUB_APP_CLIENT_SECRET` (the GitHub App's own Client ID / secret — **not** the SSO `LAT_GITHUB_CLIENT_ID`). For local dev, either point a third throwaway app's webhook at a `smee.io` proxy or test the receiver with fixture deliveries only.
- [ ] **P1-1**: `@platform/github` package — `verifyGithubSignature` (raw-body HMAC-SHA256, constant-time; modeled on `packages/platform/slack/src/signature.ts`), App JWT signing, installation-token mint + Redis cache, REST client (`getInstallation`, `listUserInstallations`, `exchangeOAuthCode`, `listInstallationRepositories`), tagged errors mapping to ack-vs-retry categories.
- [ ] **P1-2**: env plumbing — `LAT_GITHUB_APP_ID/APP_SLUG/APP_PRIVATE_KEY/WEBHOOK_SECRET/APP_CLIENT_ID/APP_CLIENT_SECRET` + optional `LAT_GITHUB_BASE_URL` (GHES) in `.env.example` (the `APP_CLIENT_*` pair is distinct from the SSO `LAT_GITHUB_CLIENT_*`); `parseEnvOptional` config helper (`isGithubIntegrationConfigured`) + URL builders (web/API/OAuth bases derived from the base URL); infra wiring in `infra/lib/secrets.ts` + `infra/lib/ecs.ts` for api/web/workers.
- [ ] **P1-3**: PG migration — extend `integrations.kind` with `"github"`; new `github_integration_details`, `github_sync_configs` (org-default + project-row uniques), and `github_deliveries` (incl. the attribution stamp columns); RLS policies; no FKs.
- [ ] **P1-4**: `@domain/github` install lifecycle — entities, ports (`GithubIntegrationRepository`, `GithubSyncConfigRepository`, `GithubDeliveryRepository`), use-cases `claimGithubInstallation` (seeds the org-default `github_sync_configs` row with the built-ins) / `disconnectGithubIntegration` / `syncInstallationFromWebhook` (suspend/unsuspend/deleted/repos-changed); db-postgres repositories + `/testing` fakes.
- [ ] **P1-5**: install flow web routes — `integrations/github/install.ts` (nonce state in Redis, 302 to the install URL) and `integrations/github/setup/callback.ts` (state validation, OAuth user-token verification via `GET /user/installations`, claim use-case, redirect to settings with success/error), mirroring the Slack OAuth routes.
- [ ] **P1-6**: receiver — `apps/api/src/routes/webhooks-github.ts` (public pre-auth mount, raw-body signature verify, slim extraction per 5.7, rate limiter) + `github-events` topic in `packages/domain/queue/src/topic-registry.ts` (add the plain `delayMs` publish option to the queue port/adapter if absent).
- [ ] **P1-7**: worker — `apps/workers/src/workers/github-events.ts` registered in `server.ts`; `installation` handler complete; `pull-request`/`push` handlers stubbed to ledger-claim + `skipped(no-config)`.
- [ ] **P1-8**: settings card — `GithubIntegrationSection` on `settings/integrations/index.tsx` (connect/disconnect/manage, account metadata), feature flag `github-integration` in the registry (follow current naming convention), env-absent hidden state.
- [ ] **P1-9**: tests — signature verify (valid/invalid/replay), receiver slim-extraction + routing, claim flow (state mismatch, spoofed installation_id rejected, cross-org claim conflict), installation webhook lifecycle (PGlite; no `vi.mock` repos).

**Exit gate**: an org admin connects GitHub from settings and the integration shows the account; a signed `ping`/`installation` delivery is verified, acked < 1s, and visible in the ledger; a spoofed setup redirect cannot claim an installation; uninstalling on GitHub revokes the integration in Latitude.

### Phase 2 — Configuration + matching engine

- [ ] **P2-1**: config domain — `githubMonitorSettingsSchema` / `githubMatchingRulesSchema` + built-in defaults constant; `resolveEffectiveSyncConfig` pure helper (nullable-inherit, replace-wholesale — `resolve-effective-config.ts` precedent).
- [ ] **P2-2**: config use-cases — `updateGithubOrgDefaults` (the `project_id IS NULL` row), `upsertGithubSyncConfig` (server-side validation that `repo_id` belongs to the org's own installation — D13), `deleteGithubSyncConfig`.
- [ ] **P2-3**: matching engine — `@domain/github` `matching/`: candidate extraction (boundaries, `#` prefix, case-insensitivity, 65,536-char cap), segmentation (lines/sentences; branch-name separator rules), keyword classification with precedence (keyword-less slugs never match), `matchTexts` public API.
- [ ] **P2-4**: keyword validation — per-list rules from 5.6 (1–64 chars, ≤ 64 per list, allowed charset, case-insensitive dedupe, no slug-shaped keywords), regex-escaping into word-bounded alternations, field errors through the settings use-cases.
- [ ] **P2-5**: golden test suite — a table-driven corpus covering every default keyword form, passive voice (`LAT-XY9Z is fixed`), `#`-prefixed refs, multi-slug segments, precedence (`Revert "Fix LAT-…"`), branch names (`fix/lat-xy9z-timeouts`), non-matches (`flat-xy9z`, `PRE-2024`, and keyword-less mentions: `feature-lat-xy9z`, a slug alone in a PR body), customized keyword lists, cap behavior. This suite is the contract for all future matcher changes.
- [ ] **P2-6**: settings UI — manage page `settings/integrations/github.tsx`: org defaults form (toggles, keyword chip-lists with reset), per-project sync config list (repo picker via `listInstallationRepositories` + Redis cache, branch select seeded with the default branch, enabled toggle, override expander with inherit/reset semantics). Server fns in `apps/web/src/domains/github/github.functions.ts`.
- [ ] **P2-7**: tests — effective-config resolution matrix (inherit/override/reset), config use-cases (org/project scoping, uniqueness, D13 repo-ownership validation), keyword validation errors, repo picker fn (HTTP mocked at the boundary).

**Exit gate**: org defaults and a project repo binding round-trip through the UI; an invalid keyword (too long, wrong charset, slug-shaped) is rejected at save with a field error; the golden matcher suite is green; overrides inherit and reset per field.

### Phase 3 — Event processing: links, actions, dedup

- [ ] **P3-1**: PG migration — `github_signal_links` (partial uniques per link type, read/absorb indexes), RLS.
- [ ] **P3-2**: link domain — entities, `GithubSignalLinkRepository` (upsert-by-natural-key, recompute set for a PR, absorb query by `{merge_commit_sha, head_sha, push_after_sha}`, list-by-signal); `GithubDeliveryRepository` gains the merge-stamp write + attribution lookup (`findMergeByAnySha`); fakes.
- [ ] **P3-3**: `pull-request` pipeline — source assembly per effective config, matcher, slug→signal resolution (`findBySlug` per bound project), the fork-PR trust gate (`head.repo.id` / `author_association`, D13), link upsert/recompute per 5.8 (incl. retarget handling, applied-links immunity), merged path: stamp merge join keys on the delivery row → state flip → action application → absorb.
- [ ] **P3-4**: action application — batch `applySignalLifecycleCommandUseCase` per `(project, command)` with `keepMonitoring` omitted; `action_applied_at` stamping; unresolve-beats-resolve at the event level.
- [ ] **P3-5**: `push` pipeline — branch gate, attribution check (three join keys), attributed fold-into-PR, unattributed standalone commit links + immediate actions, `push_after_sha` stamping, 10s grace delay on enqueue, `deleted`/`forced` handling.
- [ ] **P3-6**: revert convention — `Reverts <owner>/<repo>#<n>` body parsing on merged PRs → unresolve signals resolved by PR `#n`, unresolve links recorded on the reverting PR.
- [ ] **P3-7**: `ProjectDeleted` consumer — cascade-delete the project's repo configs and links (notifications-cascade precedent).
- [ ] **P3-8**: truncation guard — cap commits per push (200) with `truncated: true` on the ledger row; structured skip reasons throughout.
- [ ] **P3-9**: tests — the dedup matrix as the centerpiece: merge-commit/squash/rebase × PR-event-first/push-first orderings all converge to identical link + signal state; redelivery idempotency at all three layers; PR edit recompute (add/remove/applied-immunity); revert flow; cross-project same-slug; ignored/resolved no-op interplay; ledger statuses. PGlite; adapter HTTP mocked at the boundary.
- [ ] **P3-10**: isolation tests (D13) — two-org fixture: org B's slug text in org A's monitored repo touches nothing in org B (and links org A's identically-slugged signal when one exists); events from unconfigured repos and unclaimed installations are dropped before any slug parsing; a rogue repo config pointing at another org's repo never fires; fork-PR trust-gate matrix (`author_association` × same-repo/fork × pre-merge/merged).
- [ ] **P3-11**: agent-dispatch handshake (5.16/D14) — `renderDefaultPrompt` renders the signal slug and the branch/PR-title convention block on both signal-trigger branches; sharpen the "do not resolve" guard line; update the exported `defaultDispatchPromptTemplate` seed (`{{signal.slug}}`) + settings-UI template hint; extend `render-prompt.test.ts`; cross-check the emitted branch/title/description forms against the Phase 2 golden matcher suite (each must yield a resolve intent); update `dev-docs/agent-dispatch.md`.

**Exit gate**: against seeded fixtures, `opened` links a PR; merging it resolves the signal and closes any open incident silently; the base-branch push creates zero duplicate links in either delivery order for all three merge methods; a revert PR unresolves; a redelivered event changes nothing; every skip/failure is visible in the deliveries table; a PR shaped like the dispatch prompt instructs (`lat-…/…` branch, `Resolves LAT-…: …` title) links on open and resolves on merge — the full agent loop on fixtures.

### Phase 4 — Signal detail UI

- [ ] **P4-1**: `listSignalGithubLinks` server fn + collection entry (org RLS, signal→project check), wired into the detail-page load.
- [ ] **P4-2**: `signal-github-links.tsx` — clone the `signal-dispatch-history.tsx` anatomy (#4182): pill trigger (primary-link selection per 5.11, `Status` state styling, GitHub mark; add a `github` icon to `@repo/ui` if the set lacks one), single-link direct anchor, multi-link `+N` popover (header + "View all" link, `divide-y` scrollable rows: state/title/ref/author/`relativeTime`/applied-action, new-tab anchors), flag gating, hidden-when-empty.
- [ ] **P4-3**: recent-deliveries table on the manage page (Phase 1 stub → real data with skip/error reasons).
- [ ] **P4-4**: tests/QA — pill selection logic unit tests (PR-beats-commit, recency, merged-precedence); manual QA pass across 0/1/N links, all four states, dark mode.

**Exit gate**: a signal with one merged PR shows a merged pill that opens the PR in a new tab; with a PR + its commits + another PR, the popover lists them correctly ordered; a signal with no links shows nothing; the deliveries table explains a deliberately-unmatched commit.

### Phase 5 — Hardening, docs, and follow-ups

- [ ] **P5-1**: redelivery sweep — hourly repeatable job (App JWT): list app-webhook deliveries, redeliver failed ones; delivery-ledger claims make replays safe.
- [ ] **P5-2**: retention — repeatable prune of `github_deliveries` (> 30d).
- [ ] **P5-3**: oversized-push completion — compare-API walk (`before...after`, messages only) when the receiver flagged truncation.
- [ ] **P5-4**: docs — new `dev-docs/github-integration.md` (architecture, data model, matching semantics, dedup/attribution, failure policy); public docs page (setup walkthrough incl. self-host BYO app registration + GHES base URL, magic-words reference, troubleshooting via the deliveries table); cross-links from `dev-docs/signals.md` + `dev-docs/agent-dispatch.md`; fix the stale slug comments (`signal.ts:53`, `schema/signals.ts:19`).
- [ ] **P5-5**: manual E2E QA — real GitHub test repo against staging: install, bind, then the full matrix (PR merge via all three methods, direct commit, revert PR, customized keyword) verified on the signal page and in the ledger.

**Exit gate**: docs match shipped behavior; a delivery lost to downtime is recovered by the sweep within the hour; QA matrix signed off on staging.
