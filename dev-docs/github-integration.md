# GitHub integration

Inbound GitHub App integration that turns merged code into signal lifecycle transitions, the way GitHub's own "Fixes #123" closes issues. When a pull request or commit that references a Latitude signal slug lands on a configured branch, Latitude auto-resolves (or unresolves, or just references) the signal and surfaces the referencing PRs/commits on the signal detail page.

This closes the feedback edge left open by agent dispatch: `signal → agent → PR → merge → signal resolved`, with zero write permissions on the customer's repository.

See also: [`agent-dispatch.md`](agent-dispatch.md) (the outbound half of the loop; the dispatch prompt teaches agents the slug/branch convention — §"Agent-dispatch handshake"), [`signals.md`](signals.md) (the lifecycle commands this drives), [`slack-integration.md`](slack-integration.md) (the multi-tenant integration pattern this clones), [`notifications.md`](notifications.md), [`feature-flags.md`](feature-flags.md).

## Model

One GitHub App per environment (production, staging; self-hosters register their own). A customer installs the App on their GitHub account and **claims** the installation from Latitude settings, binding it 1:1 to their organization. The App's single webhook delivers every installation's events to one Latitude endpoint; each payload carries an `installation.id` for tenant routing. Steady-state operation is token-less — the App reads only what webhook payloads carry, plus a handful of read-only API calls for the repo picker and install-claim check.

Two reference types, four text sources, three actions:

| | Referenced when | Text sources | Action applied when |
| --- | --- | --- | --- |
| **Pull request** | any monitored PR event matches | PR title, PR body, head branch name, and (via merge attribution) the merged commits' messages | merged into the configured branch |
| **Commit** | a commit pushed to the configured branch matches, and the push is not attributable to a PR merge | commit message | immediately (landing on the branch *is* the merge) |

A branch is a **text source** (the PR's head ref), not a third reference type — branches reach Latitude through the PRs that carry them.

## GitHub App, least privilege

Three read-only repository permissions, nothing writable: **Pull requests** (for `pull_request`), **Contents** (the only permission that unlocks `push`), **Metadata** (forced). Subscribed events: `pull_request`, `push`, `installation`, `installation_repositories`. The App never comments, pushes, or sets statuses.

Environment (all `parseEnv`-read; the integration is invisible when unset — `isGithubIntegrationConfigured`):

```
LAT_GITHUB_APP_ID              # App id, JWT issuer for installation tokens
LAT_GITHUB_APP_SLUG            # for the install URL github.com/apps/<slug>/installations/new
LAT_GITHUB_APP_PRIVATE_KEY     # PEM (base64 in env), signs App JWTs
LAT_GITHUB_WEBHOOK_SECRET      # HMAC secret for X-Hub-Signature-256
LAT_GITHUB_APP_CLIENT_ID       # the App's OWN OAuth client for the install-claim check —
LAT_GITHUB_APP_CLIENT_SECRET   #   NOT the SSO LAT_GITHUB_CLIENT_ID/_SECRET (a different app)
LAT_GITHUB_BASE_URL            # optional; GHES host. API base derived: api.github.com for
                               #   github.com, {base}/api/v3 for GHES. All URLs built from it.
```

`@platform/github` owns the platform primitives: `verifyGithubSignature` (raw-body HMAC-SHA256, constant-time), App JWT signing, installation-token mint + Redis cache (`org:${organizationId}:github:installation-token:${installationId}`, 55m TTL), the read-only REST client (`getInstallation`, `listUserInstallations`, `exchangeOAuthCode`, `listInstallationRepositories`), the URL builders, and tagged errors that map GitHub failures to ack-vs-retry decisions. Nothing GitHub-issued is stored in Postgres.

## Install / claim / disconnect

Mirrors the Slack OAuth routes, hardened against GitHub's spoofable setup redirect ("you should not rely on the validity of the `installation_id` parameter"):

1. **Connect** (`apps/web/src/routes/integrations/github/install.ts`): mint a nonce, store `org:${organizationId}:github:install-state:${nonce}` in Redis (10m TTL, value = orgId + userId), 302 to the install URL with `state=${nonce}`.
2. **Setup callback** (`.../integrations/github/setup/callback.ts`): validate `state` (consume the nonce), exchange the OAuth `code` for a **user token** (used once, never stored), and call `GET /user/installations` to verify the `installation_id` really belongs to the installing user — the documented defense against spoofed redirects. Then `claimGithubInstallationUseCase` inserts the `integrations` parent (`kind: "github"`, `vendor_account_id = String(installation_id)`), the `github_integration_details` child, and the org-default `github_sync_configs` row (seeded with the built-in keywords) in one transaction. The partial unique on `(kind, vendor_account_id) WHERE revoked_at IS NULL` enforces one installation ↔ one org; claiming an installation active elsewhere fails clearly.
3. **Installation webhooks** maintain the claimed row (`syncGithubInstallationUseCase`): `installation.deleted` → soft-revoke the parent (configs + references kept for history); `suspend`/`unsuspend` → toggle `suspended_at`; `installation_repositories` / `new_permissions_accepted` → refresh cached metadata. Events for **unclaimed** installations are acked and dropped (install must start from Latitude).
4. **Disconnect** (settings): soft-revoke locally; references and history are kept. Uninstalling on GitHub triggers the same revoke via webhook.

## Data model

Four tables under `latitude.`, no FKs, `organizationRLSPolicy` on each, application-enforced integrity. Vendor-prefixed like `slack_*`.

```
latitude.integrations                    (EXISTS — kind "github", vendor_account_id = installation_id)

latitude.github_integration_details      (1:1 child; pure installation state — no settings)
  integration_id (PK), organization_id, installation_id, account_login, account_type,
  repository_selection (all|selected), suspended_at, created_at, updated_at

latitude.github_sync_configs             (org-default row + per-project override — the
  id, organization_id, project_id,        agent_dispatch_configs single-table cascade)
  integration_id,
  -- project_id IS NULL → THE org-default row (one per integration, seeded at claim time):
  --   carries a single default repo/branch (D16) + behavior fields
  -- project_id set    → ONE override per project (D17): its single repo+branch (may be the
  --   org default's — monorepo), behavior fields NULL → inherit
  repo_id, repo_full_name, branch, enabled,
  monitor_pull_requests, monitor_commits, sources jsonb, rules jsonb,   -- NULL → inherit
  UNIQUE (integration_id) WHERE project_id IS NULL
  UNIQUE (project_id, integration_id) WHERE project_id IS NOT NULL
  INDEX (organization_id, repo_id)

latitude.github_signal_references        (the N:M product entity — one row per signal × PR/commit)
  id, organization_id, project_id, signal_id, integration_id,
  repo_id, repo_full_name, reference_type (pull_request|commit),
  pr_number, pr_state (draft|open|merged|closed),        -- PR only
  commit_sha, push_after_sha,                            -- commit only (push_after_sha powers rebase absorb)
  title, url, author_login, matched_sources jsonb,
  action (resolve|unresolve|reference),                  -- strongest matched intent
  action_applied_at,                                     -- NULL until the lifecycle command ran (merge)
  merged_at, created_at, updated_at
  UNIQUE (organization_id, signal_id, repo_id, pr_number)  WHERE reference_type = 'pull_request'
  UNIQUE (organization_id, signal_id, repo_id, commit_sha) WHERE reference_type = 'commit'
  INDEX (organization_id, signal_id)                     -- detail-page read
  INDEX (organization_id, repo_id, commit_sha), INDEX (organization_id, repo_id, pr_number)

latitude.github_deliveries               (idempotency claim + audit ledger; merged-PR rows
  id, organization_id, integration_id,    double as the push↔PR attribution record)
  delivery_id (X-GitHub-Delivery, UNIQUE), event, action, repo_id,
  status (processed|skipped|failed, NULL while claimed-not-finalized),
  skip_reason, error_category, error_detail, truncated,
  pr_number, merge_commit_sha, head_sha,                 -- stamped on processed merged-PR deliveries
  received_at, processed_at
  INDEX (organization_id, repo_id, merge_commit_sha) WHERE merge_commit_sha IS NOT NULL
  INDEX (organization_id, repo_id, head_sha)         WHERE head_sha IS NOT NULL
```

The reference row is the product entity (the pill reads it, the dedup uniques live on it, provenance is recorded on it); the delivery row is the raw-event audit trail. There is no separate merges table — the attribution join keys fold into the delivery row as three nullable stamped columns.

**Signal slugs are organization-unique** (revises `signals.md`): unique per `(organization_id, slug) WHERE deleted_at IS NULL`, spanning projects, so a reference resolves to exactly one signal org-wide. The prefix stays project-derived (readable); org-wide uniqueness is enforced at generation (`countBySlug` counts org-wide) and by the partial unique index. Per-project resolution is unchanged (`findBySlug({ projectId, slug })`) — org-uniqueness just guarantees a slug references in exactly one project, which is what makes org-default fan-out and monorepos unambiguous.

## Configuration: org defaults + project overrides

One home: `github_sync_configs`, using the exact `agent_dispatch_configs` cascade. The **org default is the `project_id IS NULL` row** (seeded with the built-ins at claim time, carrying a single default repo/branch — D16). Each **project override** inherits per field (`NULL → inherit`, or set → **replace wholesale**, no deep merge). Resolution is the pure `resolveEffectiveSyncConfig` helper.

```ts
githubMonitorSettingsSchema = {
  monitorPullRequests: boolean,   // default true
  monitorCommits: boolean,        // default true
  sources: { commitMessage, branchName, prTitle, prBody: boolean },  // all default true
  rules: {
    resolveKeywords: string[],    // close/closes/fix/fixes/resolve/complete/implement/address/solve (+ inflections)
    unresolveKeywords: string[],  // reopen/revert/roll back/back out (+ inflections)
    referenceKeywords: string[],  // ref/refs/references/part of/related to/relates to/contributes to/toward(s)
  },
}
```

Stored settings always contain the full materialized keyword lists (so later changes to the built-ins never silently mutate existing orgs); a "Reset to defaults" affordance restores them. Config use-cases: `updateGithubOrgDefaults` (the `project_id IS NULL` row + default repo), `upsertGithubSyncConfig` (validates server-side that `repo_id` belongs to the org's own installation — see Security), `resetGithubProjectOverride`.

## Reference matching engine

A pure, exhaustively-tested module (`@domain/github` `matching/`), independent of webhooks: `matchTexts(inputs: { source, text }[], rules) → { slug, action, sources }[]`.

- **Candidate extraction**: token `#?<3 alpha>-<4 alnum>` (the exact shape `generateSignalSlug` produces), case-insensitive (branch names are lowercase), non-alphanumeric boundaries (hyphens allowed, so `feature-lat-xy9z` matches but the `lat-xy9z` inside `flat-xy9z…` does not). Each source text is truncated to 65,536 chars before scanning. False candidates are cheap — a per-project slug lookup gates every one, so a non-existent slug matches nothing.
- **Classification**: text is split into segments (lines, then sentences; branch names are one segment where `/`, `_`, `.` separate tokens). Keywords match word-bounded and case-insensitively, **before or after** the slug in its segment — so `Fixes LAT-XY9Z`, `fixes: #LAT-XY9Z`, `LAT-XY9Z is fixed`, and `Fixed LAT-XY9Z and LAT-AB12` all work. **No keyword in the segment → no match** (a slug alone never references anything). Precedence within a segment: **unresolve > resolve > reference**, so `Revert "Fix LAT-XY9Z"` is an unresolve. Per slug, the strongest action across all segments/sources wins.
- **Resolution**: uppercase the slug, `findBySlug({ projectId, slug })` for each config bound to the repo **plus each project inheriting the org-default repo** (D16). Unknown/soft-deleted slugs drop. Org-unique slugs (D15) keep every match single-referenced.

**Keyword customization is lists only — no user-supplied regex** (removes the entire ReDoS class). Keywords are validated (1–64 chars, ≤64 per list, letters/digits/spaces/hyphens, case-insensitive dedupe, no slug-shaped keyword) and compiled by our own code into regex-escaped word-bounded alternations. A future `customPatterns` addition would go under RE2 semantics (`re2js`) on the same `rules` jsonb.

## Webhook receiver

`POST /v1/webhooks/github` in **apps/api** (`webhooks-github.ts`), mounted before the auth wall alongside `bootstrap.ts`. A plain public `app.post` (not `app.openapi`) so the raw body stays readable for HMAC verification. Deliberately dumb and DB-free:

1. Verify `X-Hub-Signature-256` (constant-time HMAC-SHA256 over the raw body); invalid/missing → 401, nothing enqueued.
2. Route by `X-GitHub-Event`: `ping` → 200; `pull_request` (opened/edited/reopened/closed/ready_for_review/converted_to_draft), `push`, `installation`, `installation_repositories` → enqueue; anything else → 202 drop.
3. **Slim-extract** before enqueueing (`webhooks-github-extract.ts` — BullMQ payloads live in Redis, never enqueue a raw 25MB push): only the fields the worker needs. Push commit messages are capped at 16KiB each and **100 commits per push** (`PUSH_COMMIT_CAP`); a push over the cap (or GitHub's own 2048 truncation) is flagged `truncated` and the ledger row records it — surfaced in the deliveries table, never silent. Scanning beyond the cap is out of scope.
4. Publish to the `github-events` queue (tasks `pull-request`, `push`, `installation`) with `dedupeKey: github:${deliveryId}`, 5 attempts, exponential backoff. Push jobs additionally carry a **2.5s grace delay** (see Dedup). Respond **202** immediately.

## Event processing

One worker (`apps/workers/src/workers/github-events.ts`). Common preamble for `pull-request`/`push`: resolve `installation_id` → active claimed integration (unclaimed/suspended/revoked → ack + drop) → org; claim the delivery-ledger row; load enabled `github_sync_configs` project rows for `(organization_id, repo_id)` and resolve each against the org-default. No matching config → `skipped(no-config)` ledger row. The domain logic lives in `@domain/github` use-cases (`processGithubPullRequestUseCase`, `processGithubPushUseCase`); the worker is a thin adapter.

**Pull-request handler** — per config with effective `monitorPullRequests` and `base.ref === config.branch`:

- `opened` / `reopened` / `ready_for_review` / `converted_to_draft`: match the enabled PR sources, upsert one reference per matched signal (`pr_state`, `action`, `action_applied_at = NULL`).
- `edited`: **recompute** the PR's reference set for the project — add new matches, delete references that no longer match **unless `action_applied_at` is set** (applied provenance is never deleted). A retarget (`changes.base`) re-runs the branch gate.
- `closed`, not merged: set `pr_state = "closed"`. No action ever applies.
- `closed`, merged: ① stamp merge join keys (`pr_number`, `merge_commit_sha`, `head_sha`) on the delivery row (always, even for zero-match PRs — this powers push attribution); ② set `pr_state = "merged"`, `merged_at`; ③ apply actions for resolve/unresolve references; ④ absorb standalone commit references this merge explains; ⑤ apply the revert convention.

**Fork-PR trust gate** (D13): pre-merge reference creation requires the PR to be same-repo (`head.repo.id === repo.id`) **or** authored with standing (`author_association ∈ {OWNER, MEMBER, COLLABORATOR}`). Untrusted fork PRs are invisible until a maintainer merges them — merging requires write access, which is the trust event. Post-merge `edited` events update references but **never** apply actions (actions fire exactly once, at merge time, on the reference set of that moment).

**Push handler** — per config with effective `monitorCommits` and `ref === refs/heads/${config.branch}`; skip `deleted` pushes:

- **Attribution check** (only when `monitorPullRequests` is also on): the push belongs to a PR merge if `after` or any `commits[].id` matches a stamped merged-PR delivery (or existing PR reference) by `merge_commit_sha`/`head_sha`. Covers all three merge methods (merge-commit, squash, rebase).
- **Attributed** → fold commit-message matches into the merged PR as PR references, applying actions idempotently. No commit references created.
- **Unattributed** → per commit, upsert `commit` references (`push_after_sha = after`, `merged_at = commit timestamp`) and **apply actions immediately** (a commit on the branch is already merged).

**Revert convention**: a merged PR whose body matches GitHub's auto-generated `Reverts <owner>/<repo>#<n>` unresolves the signals PR `#n` resolved, and records unresolve references on the reverting PR — even with no slug in the revert text.

**ProjectDeleted cascade**: the `domain-events` worker publishes `github-events:delete-by-project` on `ProjectDeleted`; the handler deletes the project's configs + references.

## Dedup — merge attribution

A merged PR produces **two** deliveries — `pull_request closed` and the base-branch `push` — in no guaranteed order, and the push often repeats the PR's magic words. Resolution is signal-granular and order-independent:

- **Join keys** are stamped on every processed merged-PR delivery row; per GitHub's semantics they identify the merge push under all three merge methods (merge-commit contains `merge_commit_sha` + `head_sha`; squash's single commit = `merge_commit_sha`; rebase has `push.after == merge_commit_sha`).
- **PR-first** (common case, helped by the 2.5s push delay): the push arrives attributed → folded into the PR. No duplicate ever exists.
- **Push-first** (late/lost PR delivery): standalone commit references are created, then the PR `closed` event's **absorb** step deletes commit references on the same signal whose `commit_sha ∈ {merge_commit_sha, head_sha}` or whose `push_after_sha == merge_commit_sha` (this last clause catches every intermediate commit of a rebase merge), carrying their `matched_sources` and any applied action onto the PR reference. Net state is identical to PR-first.
- Actions stay single in effect because `applySignalLifecycleCommand` is an idempotent timestamp toggle. `commits[].distinct` is deliberately not used (attribution supersedes it; honoring it would drop legitimate PR-less fast-forward pushes). The 2.5s grace delay is an optimization, never a correctness dependency.

## Action semantics

Actions apply through the shipped `applySignalLifecycleCommandUseCase` (`signals.md`), batched per `(project, command)` with `keepMonitoring` omitted (the project→org→system settings cascade decides, same as a human resolving). `reference` intent never mutates the signal. The integration never ignores/unignores/mutes. Attribution lives on the reference row (`action`, `action_applied_at`, `url`, `author_login`), not the signal — the lifecycle system stays actor-less. Acting on an already-resolved/open/ignored/soft-deleted signal is a safe `changed: false` no-op. Auto-resolve emits `SignalEscalationEnded` (closes open incidents silently); a recurrence reopens via the shipped `SignalRegressed` path — the full loop.

## Product surface

- **Signal detail** — a GitHub references pill (`signals/$signalSlug/-components/signal-github-references.tsx`), rendered **first** in the header actions, cloning the dispatch-history anatomy. Hidden when the signal has no references. The primary reference (PRs beat commits, then most recent event within each) drives a pill showing `#<number>`/short-SHA + a state `Status` chip; a single reference is a direct new-tab anchor, N gain a `+N` popover listing PRs then commits with state/title/ref/author/relative-time and the applied action. Fed by the `listSignalGithubReferences` server fn + `useGithubDeliveries`-style query (`apps/web/src/domains/github`).
- **Settings** — the integrations card (`GithubIntegrationSection`) plus the manage page (`settings/integrations/github.tsx`): connection status, organization defaults (monitor/source toggles + the three keyword chip-lists with reset + a default repo/branch selector), and **Recent deliveries** — a keyset-paginated, infinitely-scrolling `InfiniteTable` over `github_deliveries` (event, repo, status, detail, received) for answering "why didn't my commit resolve the signal". Per-project binding lives on `settings/signals.tsx` as a single override (D17). The whole surface is hidden when the App env is absent or no installation is connected.

## Security and tenancy

Cross-org isolation is **structural, not filtered**. A slug is just text anyone can type, but slug resolution is reachable only through a chain where every hop is bound to one organization by an authenticated act of that organization:

```
signed delivery (HMAC) → GitHub-asserted installation_id → claimed integration (OAuth-proved,
  partial-unique = one org ever) → that org's github_sync_configs for (organization_id, repo_id)
  → config.projectId (a project of that same org) → findBySlug({ projectId, slug }) under RLS
```

Consequences: a slug from org B written anywhere can never touch org B's signals unless the event originates from org B's own claimed installation on a repo org B configured; events from unconfigured repos die at the config lookup (no slug is ever parsed). A repo feeds exactly one org (a repo → one GitHub account → at most one installation → at most one claiming org). Mutations additionally require a merge (GitHub write access) and pre-merge references require PR author standing (the trust gate). No global slug lookup exists anywhere in the pipeline. Other properties: three read-only permissions (Contents:read is only ever used to read commit *messages*, never file contents), constant-time HMAC with 401-before-side-effects, `org:`-prefixed Redis keys, no per-org GitHub secrets at rest, a rate-limited public receiver.

## Failure policy

| Failure | Where | Action |
| --- | --- | --- |
| Invalid/missing signature | receiver | 401, drop |
| Unhandled event/action, `ping` | receiver | 2xx, drop |
| Unknown/unclaimed installation | worker | ack + drop (no org to scope it to) |
| Suspended/revoked integration | worker | ack; ledger `skipped(suspended)` |
| No matching repo config / branch | worker | ack; ledger `skipped(no-config)` |
| Transient DB/queue error | worker | propagate → BullMQ retry; the delivery claim keeps retries idempotent |
| GitHub API 401/403 | worker / server fns | ack; ledger `failed(auth)`; settings surfaces "check app credentials" |
| GitHub API 429 / 5xx / network | worker | retry (honoring `Retry-After`) with backoff |
| Push `commits[]` over the 100 cap | worker | process the included commits, mark `truncated` — surfaced, never silent |

Idempotency is layered: the delivery claim (`INSERT … ON CONFLICT (delivery_id) DO NOTHING RETURNING`), the per-reference uniques, and the idempotent lifecycle commands — a redelivered event converges to the same end state at every layer.

## Agent-dispatch handshake

The default dispatch prompt teaches agents the convention so the loop closes hands-free: it renders the signal slug (`Ref: {slug}`) and a branch/PR convention block (`fix/{slug}-…`, `Resolves {SLUG}`) on the signal-trigger branches, cross-checked against the matcher golden suite to guarantee a `resolve` intent under the default rules. Unconditional (decoupled from GitHub config presence). Full detail in [`agent-dispatch.md`](agent-dispatch.md) §"GitHub handshake".

## Self-hosting

Self-hosters register **their own GitHub App** (BYO, per `AGENTS.md`): the public docs walk through registration (permissions, events, URLs) and the `LAT_GITHUB_*` env. When unset, the integration is invisible — zero bundled GitHub dependency. All infra is namespaced (`latitude.` tables, `github-events` queue, `org:`-prefixed Redis keys), no new runtime dependencies. **GitHub Enterprise Server** is best-effort via `LAT_GITHUB_BASE_URL` (all URLs + the derived `{base}/api/v3` API base are built from it); not exercised against a real GHES in the MVP QA matrix.

## Out of scope

- **Writing anything to GitHub** (PR comments, statuses, check runs) — would break the least-privilege promise.
- **Automated redelivery sweep** — GitHub does not auto-retry failed deliveries, so a delivery dropped during our downtime is lost. Accepted: deliveries can be re-sent manually from the GitHub App dashboard, all processing is idempotent, and a recurring signal re-opens via regression detection. The hourly App-JWT sweep (`GET /app/hook/deliveries` → `POST …/attempts`) is deferred future work.
- **Ledger retention prune** — `github_deliveries` is not pruned (low volume; attribution needs only seconds of history).
- **Oversized-push completion** — the compare-API walk to scan commits beyond the 100-commit cap is not planned; the `truncated` flag keeps the rare gap visible. 100+-commit pushes are pathological, and the resolving keyword normally rides the PR title/body or the merge/squash commit, which are always included.
- **Notifications** on auto-resolve/unresolve — the pill and the deliveries table are the visibility surfaces.
- **User-defined regex**, other forges, branch references as a first-class type, backfill of already-merged PRs, public REST/SDK/MCP surface, GitHub-initiated (unclaimed) installs, per-repo webhook mode.

## File index

| Where | What |
| --- | --- |
| `packages/platform/github` | `verifyGithubSignature`, App JWT, installation-token mint + Redis cache, REST client, URL builders, `loadGithubConfig`/`isGithubIntegrationConfigured`, tagged errors. |
| `packages/domain/github` | Entities, `matching/` engine, config validation, ports (`GithubIntegration`/`GithubSyncConfig`/`GithubDelivery`/`GithubSignalReference` repositories), use-cases (claim/disconnect/sync-installation, config CRUD, `processGithubPullRequest`/`processGithubPush`, `deleteGithubProjectData`), `resolveEffectiveSyncConfig`, `/testing` fakes. |
| `packages/platform/db-postgres/src/schema/github-*.ts` + `repositories/github-*-repository.ts` | Schemas + RLS-scoped Live adapters. |
| `apps/api/src/routes/webhooks-github.ts` + `webhooks-github-extract.ts` | Public receiver + slim extraction (`PUSH_COMMIT_CAP`). |
| `apps/workers/src/workers/github-events.ts` | The three handlers; `domain-events.ts` publishes the `ProjectDeleted` cascade. |
| `packages/domain/queue/src/topic-registry.ts` | `github-events` topic (`pull-request`/`push`/`installation`/`delete-by-project`). |
| `apps/web/src/routes/integrations/github/*` | Install + setup-callback routes. |
| `apps/web/src/domains/github/*` + `settings/.../integrations/github.tsx` + `signals/$signalSlug/-components/signal-github-references.tsx` | Server fns / collection, manage + settings UI, the references pill. |

## See also

- [specs/github-integration.md](../specs/github-integration.md) — full design + phase task list (delete once stable).
- [dev-docs/agent-dispatch.md](./agent-dispatch.md) — the outbound half of the loop and the handshake.
- [dev-docs/signals.md](./signals.md) — the lifecycle commands and org-unique slugs this depends on.
