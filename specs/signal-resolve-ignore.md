# Signal resolve/ignore — restore the manual lifecycle

> **Documentation** — durable homes after stabilization: `dev-docs/signals.md` (lifecycle section) and the public `docs/signals/*` pages. Related current docs: `dev-docs/signals.md`, `dev-docs/monitors.md`, `dev-docs/notifications.md`, `dev-docs/evaluations.md`.
>
> **Origin** — GitHub issue [#3930](https://github.com/latitude-dev/latitude-llm/issues/3930) "Restore resolved and ignored signal state transitions" (converted to a Linear project). A prior automated attempt exists as **open PR [#4071](https://github.com/latitude-dev/latitude-llm/pull/4071)**; it is **not** the implementation base (see §5) and should be closed as superseded when this spec's PR merges.
>
> **Design settled with Alex, 2026-07-20** — archived = resolved | ignored; mute is a pure notification barrier (incidents still open for muted signals — a behavior change to today's escalation check); ignore auto-mutes; regression is in scope; analytics counts and agent-toolset exposure confirmed. **Everything ships as a single PR** — do not split for size. No open questions remain.
>
> **Reverses** — the deliberate removal in PR **#3665** ("Consolidate monitor incidents and rules", commit `809715942`, 2026-06-28) and the shipped decisions `specs/signals.md` P4-d / P6-d / Decision 7 ("Manual noise control is `muted_at`, not a resolved/ignored lifecycle"). Those spec entries get a reversal note pointing here.

## Contents

1. [How resolved/ignored worked on Issues](#1-how-resolvedignored-worked-on-issues)
2. [How it was removed](#2-how-it-was-removed)
3. [Ground truth: signals today](#3-ground-truth-signals-today)
4. [What changed since Issues — why this is not a pure restore](#4-what-changed-since-issues--why-this-is-not-a-pure-restore)
5. [Prior art (PR #4071) — noted, not a base](#5-prior-art-pr-4071--noted-not-a-base)
6. [Specification](#6-specification)
7. [Decisions](#7-decisions)
8. [Plan](#8-plan)
9. [Tasklist](#9-tasklist)

---

## 1. How resolved/ignored worked on Issues

Everything below was verified at commit `0cd29cb9b~1` (the last commit with `packages/domain/issues/`, just before the Issues → Signals rename #3608).

**State model.** `ISSUE_STATES = ["new", "escalating", "ongoing", "resolved", "regressed", "ignored"]`. Two stored columns — `resolved_at` and `ignored_at`, bare nullable timestamps, **no actor attribution** — plus derived states from `deriveIssueLifecycleStates`:

- `new` — `createdAt` within `NEW_ISSUE_AGE_DAYS = 7`
- `escalating` — open `alert_incidents` row of kind `issue.escalating`
- `regressed` — `resolvedAt IS NULL` **and** an `issue.regressed` incident row exists (the `resolvedAt` gate meant re-resolving cleared the regressed display while keeping the incident history)
- `resolved` — `resolvedAt IS NOT NULL`; `ignored` — `ignoredAt IS NOT NULL`
- `ongoing` — fallback when nothing else applies; states are a **set** (an issue could be `new` + `escalating`)

**Commands.** `applyIssueLifecycleCommandUseCase` with `z.enum(["resolve", "unresolve", "ignore", "unignore"])`, batch (`issueIds`), one transaction, per-row `SELECT … FOR UPDATE`, cross-project ids rejected. Pure idempotent timestamp toggles — resolve set `resolvedAt` only if null (`changed: false` otherwise), unresolve nulled it, same for ignore. Resolve and ignore were **independent axes** (both could be set at once — a wart, see D2).

**`keepMonitoring`.** Resolve-only flag, defaulted through the project→org→system settings cascade (`resolveSettings`, system default `true`). Side effect: **ignore always soft-deleted linked evaluations; resolve did so only when `keepMonitoring === false`** (`evaluationRepository.softDeleteByIssueId`, commented "Temporary until the evaluations dashboard exists"). Unresolve/unignore never resurrected evaluations.

**Behavioral effects** (each anchored in old code):

| Concern | Behavior |
| --- | --- |
| Escalation check (`check-issue-escalation`) | **Ignored issues short-circuited** to `transition: "none"` ("user intent is that they no longer drive automated lifecycle changes or alerting"). Resolved issues were still checked — an `enter` transition **auto-cleared `resolvedAt`** in the same transaction. |
| Regression (`assign-score-to-issue`) | New score assigned to a resolved, non-ignored issue with `score.createdAt > resolvedAt` → cleared `resolvedAt` ("reified at write time", idempotent) and emitted `IssueRegressed` → `issue.regressed` incident + notification. **Ignored issues never regressed.** |
| Incident close | A changed resolve/ignore wrote `IssueEscalationEnded` with `reason: "resolved" \| "ignored"` — closing any open escalation **silently** (the `IncidentClosed` consumer suppresses the recovery notification for those reasons; organic exits notify). |
| Discovery / matching | `hybridSearch` and `findSimilarByCentroid` deliberately **included** resolved/ignored issues — new occurrences kept attaching (no duplicate issues; regression detection stays possible; ignored buckets keep swallowing their noise). |
| Command-palette org search | `searchOrgWide` **excluded** resolved/ignored. |
| List tabs | `lifecycleGroup`: `active` = not ignored and not resolved; `archived` = ignored or resolved. Bulk actions flipped per tab (Resolve-with-switch / Ignore ⇄ Unresolve / Unignore). |
| Analytics / export | Analytics counted `resolved`; CSV export carried `resolvedAt` / `ignoredAt` columns. |

**No `IssueResolved` / `IssueIgnored` domain events existed** — the only lifecycle events were `IssueRegressed` and the `reason`-carrying `IssueEscalationEnded`.

## 2. How it was removed

PR **#3665** (`809715942`, merged 2026-06-28) consolidated monitors and signal escalation onto the source-keyed `incidents` hub and, as part of it, **deliberately** collapsed the manual lifecycle into notification-mute:

- `signalLifecycleCommandSchema` shrank to `["mute", "unmute"]`; the 544-line lifecycle test was deleted.
- `SIGNAL_STATES` cut to `["new", "escalating", "ongoing"]`; the entity lost `resolvedAt`/`ignoredAt`, gained `mutedAt`.
- `assign-score-to-signal` lost the `isRegression` block; `SignalRegressed` died with it.
- Migration `20260623104510_monitors-incidents-consolidation`: `UPDATE signals SET muted_at = COALESCE(ignored_at, resolved_at) WHERE muted_at IS NULL AND (…)`, then **`DROP COLUMN escalated_at / resolved_at / ignored_at`**. The resolved-vs-ignored distinction of pre-existing rows is unrecoverable.
- API `/resolve`, `/unresolve`, `/ignore`, `/unignore` removed; web reduced to Mute/Unmute with Active/Archived tabs keyed on `mutedAt`.

Ten days later #3930 asked for it back.

## 3. Ground truth: signals today

- **Entity** (`packages/domain/signals/src/entities/signal.ts`): `mutedAt` is the only manual lifecycle field; plus triage (`priority`, `assigneeId`), `origin` (`user`/`system`), `source`, `filters`, centroid fields, `deletedAt` soft-delete.
- **States** (`constants.ts:6`, `helpers.ts` `deriveSignalLifecycleStates`): derived `new` / `escalating` / `ongoing`; `escalating` = open `incidents` row (`sourceType='signal'`, `endedAt IS NULL`) joined as `lifecycle.isEscalating` by `SignalRepository`.
- **Commands** (`use-cases/apply-signal-lifecycle-command.ts`): `["mute", "unmute"]` — a `mutedAt` toggle. Still accepts a vestigial `keepMonitoring` input (hardcodes `true` in the result). The `resolveSettings` cascade still carries `keepMonitoring` (`packages/domain/shared/src/settings.ts:9`, marked "deprecated" — it isn't anymore).
- **Mute semantics**: `check-signal-escalation.ts:87` short-circuits muted signals (no incidents opened); `searchOrgWide` excludes muted; discovery, matching, evaluation execution, and analytics continue.
- **Tabs**: `SignalsLifecycleGroup = "active" | "archived"` where archived = `mutedAt !== null` (`list-signals.ts`). So **today, mute IS the archive action** in the user's mental model.
- **API** (`packages/operations/src/operations/signals.ts`): `muteSignals` / `unmuteSignals` built by the in-file `buildLifecycleEndpoint` factory (line 153), registered in `signalsModule`; response items `{signalId, mutedAt, updatedAt, changed}`.
- **Detector lifecycle** (`@domain/evaluations`): `monitorSignal` / `unmonitorSignal` attach/realign or soft-delete the signal's active evaluation; `deleteSignal` soft-deletes the signal and archives its evaluation. The matching pipeline (`apps/workers/src/workers/signals-match.ts`) selects by *active evaluations*, so archiving an evaluation is what stops write-time detection.
- **Pre-staged remnants** (the codebase is half-ready for this restore):
  - `SignalEscalationEnded` / `IncidentClosed` payloads still carry `reason: … | "resolved" | "ignored"` (`packages/domain/events/src/event-payloads.ts:142,174`), and the dispatcher still suppresses recovery notifications for those reasons (`apps/workers/src/workers/domain-events.ts:303-307`).
  - Web formatters still know the labels: `lifecycleDisplayOrder = ["regressed","escalating","new","ongoing","resolved","ignored"]` (`apps/web/src/components/signals/lifecycle-formatters.ts:1`) and badge variants for all three (`signal-lifecycle-statuses.tsx`).
  - Admin project metrics still model a resolved/ignored timeline, currently fed `resolvedAt: null, ignoredAt: row.mutedAt` (`packages/platform/db-postgres/src/repositories/admin-project-repository.ts:180`).
  - `EvaluationRepository.softDeleteBySignalId` and `SignalRepository.findByIdForUpdate` exist.
  - Seeds still carry `resolvedDaysAgo`/`ignoredDaysAgo` fixtures mapped into `mutedAt` (`packages/platform/db-postgres/src/seeds/signals/index.ts`).

## 4. What changed since Issues — why this is not a pure restore

1. **Signals have detectors that cost money.** Old issues were annotation clusters; occurrences arrived only via discovery. A signal today can have an active evaluation (often an LLM judge) running against every in-scope trace via `signals:match`. Resolve/ignore must say what happens to that detector — and "keep monitoring" is now the *mechanism regression detection rides on*, not just a billing preference.
2. **User-origin signals are defined by their evaluation.** For `origin = "user"` signals the evaluation *is* the signal's meaning. Archiving it on ignore is destructive in a way it never was for issues (unignore never resurrected evaluations; the user must re-author via Edit / re-track).
3. **Escalation moved to the incidents hub.** `escalating` is now derived from open `incidents` rows; the old `issue.regressed` alert-kind axis is retired, so the old "regressed = incident row of that kind" derivation has no home. A restored `regressed` needs its own storage (D6).
4. **Mute now exists and must stay orthogonal.** Old issues had no mute. The restored model has three independent manual controls: resolve (archived, watch for recurrence), ignore (archived, stop caring), mute (visible, just don't notify).
5. **New consumers of signal state**: agent dispatch (`request-agent-dispatch.ts` skips `mutedAt` only) and incident notification fan-out (`request-incident-notifications.ts` likewise) — both need the ignored gate too.
6. **Data loss already happened.** Every pre-#3665 resolved or ignored signal is now just "muted". Whatever backfill we choose can only approximate (D5).

## 5. Prior art (PR #4071) — noted, not a base

An earlier automated attempt exists as open PR #4071 (branch `origin/cursor/restore-signal-resolved-ignored-394f`). **This spec is implemented fresh; do not port its code, tests, or docs.** The PR predates the refined mute semantics (§6.1), has no regression support while its UI copy promises it, allows resolved+ignored to coexist, adds no backfill, and leaves the monitor guard UI-only. Its review had exactly two lasting outputs, both already folded into §3: confirming which scaffolding is pre-staged on `development`, and confirming nothing on `development` conflicts with work in this area. Close the PR as superseded when this spec's PR merges.

## 6. Specification

### 6.1 State model

```ts
export const SIGNAL_STATES = ["new", "escalating", "ongoing", "resolved", "regressed", "ignored"] as const
```

Stored on `signals`: `resolved_at`, `ignored_at`, `regressed_at` — nullable timestamptz, no actor attribution (parity; revisit if audit needs arise), all added in one migration. `deriveSignalLifecycleStates` grows:

```text
if isSignalNew(createdAt, now)            → add "new"
if lifecycle.isEscalating                 → add "escalating"
if regressedAt !== null                   → add "regressed"
if resolvedAt !== null                    → add "resolved"
if ignoredAt !== null                     → add "ignored"
if empty                                  → add "ongoing"
```

Index: rebuild `signals_project_lifecycle_idx` as `(organization_id, project_id, ignored_at, resolved_at, muted_at, created_at)`.

**Three manual controls, three separate buttons** (this is the copy baseline for UI and docs):

- **Resolve** — "I fixed this. Archive it, keep watching for recurrence, tell me if it comes back."
- **Ignore** — "This is noise. Archive it, stop spending on it, never notify me about it." **Ignoring also mutes.**
- **Mute** — "Keep tracking it — incidents included — just don't notify me." A pure **notification barrier**: toggleable on active *and* archived signals, orthogonal to the other two except for the one convenience that ignore sets it.

`archived` (the list super-state) = resolved **or** ignored. Muted is never an archive state again.

**Mute behavior change.** Today `check-signal-escalation.ts:87` short-circuits muted signals, so they never open incidents — the implementation is stricter than the documented intent ("mute suppresses notification fan-out", `specs/signals.md:117`). This spec removes that short-circuit: **muted signals get escalation checks and open/close incidents normally; the only mute effect is suppressing notification fan-out** (the gate already exists at `request-incident-notifications` / the dispatcher) and agent dispatch. A muted active signal that escalates produces a visible incident row and no notification.

### 6.2 Transitions

`signalLifecycleCommandSchema = z.enum(["resolve", "unresolve", "ignore", "unignore", "mute", "unmute"])`, same batch/transaction/`findByIdForUpdate`/idempotency shape as today.

| Command | Effect | Evaluations | Events |
| --- | --- | --- | --- |
| `resolve` | `resolvedAt = now`; **clears `ignoredAt`**, `regressedAt`, and `mutedAt` (D2; amended 2026-07-21 — regression alerts must reach the user, so resolve always unmutes) | archived only when effective `keepMonitoring === false` (input ?? settings cascade) | `SignalEscalationEnded(reason: "resolved")` when changed |
| `unresolve` | `resolvedAt = null`; `mutedAt` cleared | untouched (never resurrects) | none |
| `ignore` | `ignoredAt = now`; **clears `resolvedAt`** and `regressedAt` (D2); **sets `mutedAt = now` if null** (auto-mute) | always archived (`softDeleteBySignalId`) | `SignalEscalationEnded(reason: "ignored")` when changed |
| `unignore` | `ignoredAt = null`; **`mutedAt` cleared** — ignore set the mute, so leaving the ignored state releases it (amended 2026-07-21) | untouched | none |
| `mute` / `unmute` | `mutedAt` toggle, exactly as today | untouched | none |

The mute rule: only an explicit `mute` or an `ignore` sets `mutedAt`; every other lifecycle command (`resolve`, `unresolve`, `unignore`) clears it, so a signal never leaves a lifecycle transition silently muted. Explicit mute/unmute never touch the other axes. No-op commands (`changed: false`) emit nothing. Result items carry `{signalId, resolvedAt, ignoredAt, mutedAt, updatedAt, changed}`.

### 6.3 Interplay matrix

| System | Rule | Where |
| --- | --- | --- |
| Escalation check | **Remove the `mutedAt` short-circuit** (muted signals are checked and open/close incidents — mute gates only the fan-out). Skip only when `ignoredAt !== null`. Resolved signals are still checked; an `enter` transition clears `resolvedAt` and sets `regressedAt` in the same transaction — and now works for muted+resolved signals too. | `check-signal-escalation.ts` |
| Escalation sweep | Unchanged — the skip lives inside the check. | `sweep-escalating-signals.ts` |
| Incident close | Changed resolve/ignore emits `SignalEscalationEnded` with the manual reason → existing consumer closes the open incident **silently** (recovery-notification suppression is already shipped). Verify the consumer no-ops when no incident is open. | `domain-events/incidents.ts`, `domain-events.ts:303` |
| Notification fan-out | The `signal.mutedAt` gate at fan-out becomes the **only** mute effect (it exists today but is dead code since muted signals never escalate; it goes live). Extend the skip to `ignoredAt` as race protection (ignored signals shouldn't open incidents at all). | `request-incident-notifications.ts` |
| Agent dispatch | Keep the `mutedAt` skip (dispatching an agent is a notification in this sense) and extend it to `ignoredAt` and `resolvedAt` (a delayed request must not automate an archived signal). | `request-agent-dispatch.ts:135` |
| Discovery / matching | **Unchanged**: resolved/ignored signals stay valid match candidates for `hybridSearch` / `findSimilarByCentroid` — prevents duplicate signals and keeps ignored buckets swallowing their noise. | `signal-repository.ts` |
| Evaluation execution | Ignore archives active evaluations → `signals:match` stops running them via the existing active-detector scan (no new pipeline gate needed). Resolve keeps the detector running unless `keepMonitoring === false`. | `apply-signal-lifecycle-command.ts` |
| Monitor guard | `monitorSignalUseCase` rejects resolved/ignored signals server-side (new `SignalNotActiveForMonitoringError`, HTTP 422); UI `canMonitorSignal` matches with tooltip "Unresolve or unignore this signal first". | `@domain/evaluations/monitor-signal.ts` |
| Org-wide palette search | Exclude resolved and ignored. **Muted-only signals become searchable again** (they are active now); today's muted exclusion keys off the archive concept, which moves to resolved/ignored. | `searchOrgWide` |
| List / tabs | `archived` = `resolvedAt !== null \|\| ignoredAt !== null`; muted-only signals are Active with a muted badge. Sort state priority: escalating 0, regressed 1, new 2, ongoing 3, resolved 4, ignored 5. | `list-signals.ts` |
| Analytics | `getSignalAnalytics` counts gain `resolved` and `ignored` alongside new/escalating/ongoing/total; the list analytics panel renders them. | `get-signal-analytics.ts`, panel component |
| Export CSV | Add `resolvedAt` / `ignoredAt` columns. | `build-signals-export.ts` |
| Admin metrics | Feed real `resolvedAt` / `ignoredAt` into `ProjectSignalLifecycleEvent` (drop the `mutedAt` shim). | `admin-project-repository.ts:180` |

### 6.4 Regression

Old behavior: any new occurrence on a resolved issue reopened it and flagged regression. In the new world occurrences arrive on **two paths**, and both must reopen:

1. **Discovery path** — `assignScoreToSignalUseCase` (annotation/flagger scores routed by discovery).
2. **Evaluation path** — the write-time score writer (`runLiveEvaluationUseCase`) stamping `signal_id` on a present verdict. This path did not exist for issues; without it, a resolved signal with an active detector would stay "resolved" forever while occurrences silently pile up.

Shared mechanism — `reopenSignalOnOccurrenceUseCase` built on a single race-safe conditional claim:

```sql
UPDATE signals SET resolved_at = NULL, regressed_at = $now, updated_at = $now
WHERE id = $signalId AND resolved_at IS NOT NULL AND ignored_at IS NULL
  AND resolved_at < $scoreCreatedAt
RETURNING id
```

- Row returned → emit `SignalRegressed { organizationId, projectId, signalId, regressedAt, triggerScoreId }` (outbox). No row → no-op (a later score in the same cycle sees `resolved_at IS NULL`; idempotent by construction, exactly like the old "reified at write time" comment).
- The `resolved_at < score.created_at` guard keeps replayed/out-of-order historical scores from reopening (old parity).
- Ignored signals never reopen (explicit guard, though D2 makes the combination unreachable).
- `regressedAt` is cleared only by a new `resolve` or `ignore` (old parity: regressed displayed until re-resolved).
- **Notification**: `SignalRegressed` → new notification kind `signal.regressed` through the notifications pipeline directly (in-app + email, project gate in the signals group, per `dev-docs/notifications.md` / the notifications skill) — *not* an incident row; the `issue.regressed` alert-kind axis stays retired. Mute gates it (`signal.mutedAt`), matching escalation fan-out.
- Do **not** register the event before its handler exists — unhandled outbox names dead-letter (per the rename corrections in `specs/signals.md`). Event, dispatcher handler, and notification kind land together.

Since regression ships in the same PR, resolve copy promises it from day one: "Archive this signal. We'll alert you if it comes back."

### 6.5 Backfill (D5)

In `20260623…` every resolved/ignored signal became `muted_at = COALESCE(ignored_at, resolved_at)`, and since then muting has been the UI's archive action. To keep every currently-archived signal archived after the tab semantics flip:

```sql
UPDATE signals SET ignored_at = muted_at WHERE muted_at IS NOT NULL;
```

`ignored` is the closest semantic ("archived, not watching") and we cannot recover which rows were resolved. **`muted_at` is kept** — that is exactly the state a fresh ignore produces under the auto-mute rule (6.2), so backfilled rows are indistinguishable from newly ignored ones. The alternative — no backfill — would dump every archived signal back into the Active tab.

### 6.6 API / SDK / MCP / CLI

Four operations via `buildLifecycleEndpoint` in `packages/operations/src/operations/signals.ts`, registered in `signalsModule`, `rateLimitTier: "medium"`, group `signals`:

| Operation | Route | Body |
| --- | --- | --- |
| `resolveSignals` | `POST /v1/projects/{projectSlug}/signals/resolve` | `{ signalIds, keepMonitoring? }` ("Defaults to the project setting.") |
| `unresolveSignals` | `POST …/signals/unresolve` | `{ signalIds }` |
| `ignoreSignals` | `POST …/signals/ignore` | `{ signalIds }` ("Monitoring is also stopped for each ignored signal.") |
| `unignoreSignals` | `POST …/signals/unignore` | `{ signalIds }` |

- `Signal` / `SignalDetail` / lifecycle-item response schemas gain `resolvedAt` / `ignoredAt` (ISO, nullable); `states` enum widens; `lifecycleGroup` descriptions rewritten ("`active` = not resolved and not ignored"); `ignoreSignals` docs state the auto-mute; `getSignalAnalytics` response gains `resolved` / `ignored` counts; `muteSignals` descriptions updated to the notification-barrier wording ("incidents still open").
- Regenerate **all** artifacts in the same PR: `pnpm generate:all` (openapi + mcp + TS/Python SDK + CLI reference) — the schema/description changes make this mandatory, not batchable.
- Agent exposure: the four verbs reach AI agents automatically through the MCP surface (they are execute-form ops in the `signals` group). The in-process `signal-agent` toolset stays **read-only**: it is the signal generator's research surface, whose documented guarantee is "no mutation reaches the agent by construction" — raising its ceiling to `write` would also admit `createSignal`/`deleteSignal`/`muteSignals` to that agent. (Implementation finding, deviates from the earlier "add them to the toolset" call; a future triage-assistant toolset can opt in with `defineToolset({ groups: ["signals"], access: "write" })`.)

### 6.7 Web UI

- **`signal-lifecycle-actions.tsx`**: **three separate controls.** Resolve/Unresolve as the primary button (Resolve confirmation modal with a "Keep evaluating this signal" `Switch`, seeded from `keepMonitoringDefault` via `resolveSettings`, shown only when active linked evaluations exist); Ignore/Unignore as a distinct secondary button (modal copy notes "Notifications are also muted"); **Mute as a bell-icon toggle** available on active *and* archived signals, tooltip "Incidents keep opening; you just won't be notified". Command-palette commands for all six verbs. For **user-origin** signals the ignore modal warns: "Its evaluation will be archived. Unignoring won't restore it — re-create it from Edit."
- **List page** (`signals/index.tsx`): Active/Archived tabs now split on resolved/ignored; bulk Resolve (with switch) + bulk Ignore on Active; bulk Unresolve/Unignore on Archived; bulk Mute/Unmute stays available on both tabs as the tertiary action. Analytics panel gains resolved/ignored counts (6.3).
- **Detail page/drawer**: `lifecycleGroup` from `resolvedAt || ignoredAt`; "Resolved at"/"Ignored at" summary fields; `canMonitorSignal` gated on active; the muted badge/bell renders independently of the archive state.
- Badges/formatters: already pre-staged (`lifecycle-formatters.ts`, `signal-lifecycle-statuses.tsx`) — no changes needed beyond exercising them.
- Copy: signals are "signals" everywhere.

### 6.8 Docs

- `dev-docs/signals.md`: rewrite "Lifecycle and Mute" into the three-control model (resolve / ignore / mute), transitions, escalation interplay, regression; drop the stale `escalatedAt` timestamp bullet (column was dropped in #3665); line 147's "resolve/ignore keep their own use-cases" becomes true again.
- `specs/signals.md`: annotate P4-d, P6-d, and Decision 7 with a reversal note referencing this spec (do not silently rewrite checked history).
- Public docs: `docs/signals/management.md` ("Resolve and ignore" + "Mute notifications" sections) and `docs/signals/overview.mdx` (state table) — port from the prior attempt's two docs commits.

## 7. Decisions

All decisions are settled (design review with Alex, 2026-07-20).

- **D1 — Restore stored timestamps + derived states.** Matches the old model and the pre-staged UI/event scaffolding. Three separate controls with distinct meanings (6.1).
- **D2 — Resolve and ignore are mutually exclusive** (deviation from Issues): setting one clears the other. The old both-at-once combination had no meaning and produces stuck states (unresolving a resolved+ignored signal would leave it archived). Un-commands still only clear their own timestamp.
- **D3 — Mute is a pure notification barrier — incidents are still created** (behavior change to today's escalation check, 6.1). Only mute and ignore set `mutedAt`; resolve, unresolve, and unignore clear it (amended 2026-07-21) — no lifecycle transition leaves a signal silently muted.
- **D4 — Detector handling keeps the destructive-archive parity** (ignore always archives evaluations; resolve archives only when `keepMonitoring` is false), reusing `softDeleteBySignalId` and the existing active-detector scan as the write-stop. *Alternative considered*: a reversible matching-pipeline gate — cleaner for user-origin signals but adds a new gate + column semantics; deferred, revisit if unignore-churn becomes real. The UI warning (6.7) covers the user-origin sharp edge.
- **D5 — Backfill muted → ignored, keeping `muted_at`** (6.5): every currently-archived signal stays archived, and the resulting rows match what a fresh ignore produces.
- **D6 — Reopen semantics**: escalation-enter auto-unresolves (now also for muted+resolved signals, since mute no longer skips the check), and occurrence-driven reopen fires on **both** occurrence paths with the `regressed` state and its notification — all in the same PR.
- **D7 — `regressed` is a stored timestamp (`regressed_at`), not an incident kind.** The old `issue.regressed` alert-kind axis stays retired; a stored marker cleared by re-resolve/ignore reproduces the old display rule and powers the `signal.regressed` notification without an incident row.
- **D8 — Server-side monitor guard** (not just UI): `monitorSignal` on a resolved/ignored signal fails 422.
- **D9 — Skip sets**: notification fan-out gates on `mutedAt` (now the live, sole mute effect) + `ignoredAt` (race protection); agent dispatch gates on both too.
- **D10 — No `SignalResolved`/`SignalIgnored` domain events** (parity — none existed; nothing consumes them today). Revisit if destinations/audit ask.
- **D11 — Analytics counts and agent toolset**: `getSignalAnalytics` gains resolved/ignored counts; the `signal-agent` toolset gains the four lifecycle verbs.
- **D12 — One PR, implemented fresh** on a branch off `origin/development` (PR into `development`); everything in this spec — lifecycle, mute change, regression, API, UI, docs — ships together, size notwithstanding (explicit product call). #4071 is not ported (§5) and is closed as superseded when it merges.

## 8. Plan

**One PR** containing everything in this spec, branch from `origin/development`, PR into `development` (repo convention). Suggested implementation order (bottom-up, each layer typechecks before the next): schema + migration → domain (commands, escalation, reopen/regression) → events + notifications → guards + consumers → operations + artifact regen → web → seeds + docs. Commits can follow that order for reviewability, but nothing splits into a separate PR.

## 9. Tasklist

> Status legend — `[ ] pending`, `[~] in progress`, `[x] complete`.


### Single PR — resolve/ignore/mute semantics + regression

**Schema + data**

- [x] **T-a** *(shipped as two migrations — generated DDL + a `pg:generate:custom` backfill — per the drizzle-kit rule against hand-editing generated files)* Drizzle migration (one, fresh timestamp): `ALTER TABLE latitude.signals ADD COLUMN resolved_at timestamptz, ADD COLUMN ignored_at timestamptz, ADD COLUMN regressed_at timestamptz`; drop + recreate `signals_project_lifecycle_idx` as `(organization_id, project_id, ignored_at, resolved_at, muted_at, created_at)`; append the D5 backfill `UPDATE signals SET ignored_at = muted_at WHERE muted_at IS NOT NULL` (`muted_at` kept — matches the ignore auto-mute invariant). Regenerate snapshot; verify data preservation on a copy.
- [x] **T-b** Schema + mappers: `packages/platform/db-postgres/src/schema/signals.ts` (+`resolvedAt`/`ignoredAt`/`regressedAt`), `signal-repository.ts` (`toDomainSignal`, insert row, `save` on-conflict set), fake repository in `@domain/signals/testing`.

**Domain (`@domain/signals`)**

- [x] **T-c** Entity + constants: `signalSchema` gains `resolvedAt`/`ignoredAt`/`regressedAt` (required nullable); `SIGNAL_STATES` gains `"resolved"`/`"regressed"`/`"ignored"`; `SignalState` members.
- [x] **T-d** `deriveSignalLifecycleStates` adds the three branches (6.1); update `helpers.test.ts`.
- [x] **T-e** `apply-signal-lifecycle-command.ts`: widen the enum to all six commands; `applyCommandToSignal` with D2 cross-clearing (resolve/ignore clear each other **and** `regressedAt`) and the ignore **auto-mute** (`mutedAt = now` if null; unignore leaves `mutedAt`); `keepMonitoring` input ?? `resolveSettings({projectId})` cascade (remove the stale "deprecated" TODO in `packages/domain/shared/src/settings.ts:9`); `shouldSoftDeleteLinkedEvaluations` (ignore always; resolve when effective `keepMonitoring === false`) → `evaluationRepository.softDeleteBySignalId`; emit `SignalEscalationEnded(reason)` per changed resolve/ignore; result items carry all four timestamps. No `as Effect.Effect` cast.
- [x] **T-f** Fresh use-case tests (do not port #4071's): per-command idempotency; D2 cross-clearing both directions (+ `regressedAt`); ignore auto-mutes / doesn't overwrite an existing `mutedAt` / unignore leaves mute; `keepMonitoring` settings cascade + soft-delete matrix; un-commands never resurrect evaluations; cross-project rejection; one `SignalEscalationEnded` per changed signal on bulk, none on no-ops or un-commands; mute/unmute touch nothing else.
- [x] **T-g** `check-signal-escalation.ts`: **remove the `mutedAt` short-circuit**; skip only when `ignoredAt !== null`; on `enter`, reopen via the `claimReopenOnOccurrence` conditional claim in the transaction (PR review: a save of the earlier unlocked read could clobber concurrent lifecycle writes or reopen a just-ignored signal). Tests: muted signal opens an incident; muted+resolved reopens on enter; ignored is skipped.
- [x] **T-h** `reopenSignalOnOccurrenceUseCase`: the conditional-claim UPDATE (6.4) + `SignalRegressed` outbox emit on claim; tests (idempotency within a cycle, `resolved_at < score.created_at` guard, ignored never reopens).
- [x] **T-i** Hook the discovery path: `assignScoreToSignalUseCase` calls the reopen use-case (the old inline `isRegression` logic, adapted).
- [x] **T-j** Hook the evaluation path: the `signal_id`-stamping writer (`runLiveEvaluationUseCase`) triggers reopen on present verdicts (only when stamping; the conditional UPDATE keeps the hot path cheap).
- [x] **T-k** `list-signals.ts`: `matchesLifecycleGroup` → archived = resolved || ignored; `LIFECYCLE_STATE_PRIORITY` per 6.3 (regressed = 1); update `list-signals.test.ts` (archived fixtures move off `mutedAt`).
- [x] **T-l** `searchOrgWide`: exclude resolved/ignored, stop excluding muted-only (both tiers); `search-org-signals.ts` doc line; port-doc comments in `signal-repository.ts` ("included in similarity, excluded in palette").
- [x] **T-m** `get-signal-analytics.ts`: add `resolved`/`ignored` counts (D11).
- [x] **T-n** `build-signals-export.ts`: add `resolvedAt`/`ignoredAt` CSV columns.

**Events + notifications**

- [x] **T-o** `SignalRegressed` payload in `event-payloads.ts` + dispatcher handler + notification kind `signal.regressed` (NOTIFICATION_KIND_META, group, project gate, in-app + email templates, web renderer — follow the notifications skill); fan-out gated on `signal.mutedAt`. Event and handler land together (dead-letter rule).
- [x] **T-p** Fan-out gates: `request-incident-notifications.ts` keeps the `mutedAt` skip (now the live, sole mute effect) and adds `ignoredAt` + `resolvedAt`; `request-agent-dispatch.ts` likewise on both dispatch paths (PR review: a delayed job must not notify or automate an archived signal). Tests: muted signal's incident notifies nobody but the incident row exists; ignored/resolved skip races covered.
- [x] **T-ac** Agent-dispatch `signal.regressed` trigger: new `AGENT_DISPATCH_TRIGGERS` entry, `SignalRegressed` → `agent-dispatch request` publish (deduped on `signalId:triggerScoreId`), trigger threaded through the signal-source path (discovery's user-origin skip does not apply to regressions), regressed prompt framing, settings-UI checkbox, docs.

**Guards + consumers**

- [x] **T-q** `@domain/evaluations/monitor-signal.ts`: reject resolved/ignored (`SignalNotActiveForMonitoringError`, 422) + test.
- [x] **T-r** Admin metrics: `admin-project-repository.ts` maps real `resolvedAt`/`ignoredAt`; check `composeSignalLifecycleTimeline` buckets still hold.

**API + artifacts**

- [x] **T-s** `packages/operations/src/operations/signals.ts`: four `buildLifecycleEndpoint` operations (6.6) registered in `signalsModule`; lifecycle item + `Signal`/`SignalDetail` schemas gain `resolvedAt`/`ignoredAt`/`regressedAt`; `states` enum widened; `lifecycleGroup` + `muteSignals`/`ignoreSignals` descriptions per 6.6; detail response carries `keepMonitoringDefault`; `getSignalAnalytics` response gains the new counts.
- [x] **T-t** ~~`signal-agent.ts` toolset gains the lifecycle verbs~~ — kept read-only; see the 6.6 note (the verbs reach agents via MCP; the generator's research toolset must not admit mutations).
- [x] **T-u** `pnpm generate:all` — openapi.json, mcp.json, TS SDK, Python SDK, CLI reference — committed in this PR.

**Web**

- [x] **T-v** `signals.functions.ts` / `signals.collection.ts`: mappers gain the timestamps; `applySignalLifecycleAction`/bulk accept the new commands + `keepMonitoring`; detail record gains `keepMonitoringDefault`.
- [x] **T-w** `signal-lifecycle-actions.tsx`: three separate controls per 6.7 (Resolve primary with keep-evaluating switch + "we'll alert you if it comes back" copy; Ignore with auto-mute note + user-origin evaluation warning; Mute as a bell toggle on both tabs); unresolve copy "new occurrences won't mark it as regressed"; palette commands for all six verbs.
- [x] **T-x** List page tabs/bulk actions per 6.7 + analytics panel resolved/ignored counts; detail page/drawer `lifecycleGroup`, "Resolved at"/"Ignored at" fields, regressed badge (pre-staged variants), `canMonitorSignal` + tooltip, independent muted badge.
- [x] **T-y** Seeds: restore `resolvedAt`/`ignoredAt` (+ a regressed fixture) — drop the `mutedAt` mapping shim. Extended so fixtures cover every lifecycle shape (resolved, resolved+muted, ignored auto-muted, regressed, new+regressed, active+muted) via explicit `regressedDaysAgo`/`mutedDaysAgo` fixture fields with invariant checks, plus two extra active monitors (regressed `issue:installation`, ongoing `issue:extra:4`) so resolve-with-`keepMonitoring` is testable on active, ongoing, and regressed signals.

**Docs + hygiene**

- [x] **T-z** Docs, written fresh: `dev-docs/signals.md` lifecycle rewrite (three controls, mute-incidents change, regression); `specs/signals.md` reversal notes on P4-d/P6-d/Decision 7; `docs/signals/management.md` + `overview.mdx`; `dev-docs/notifications.md` kind table.
- [x] **T-aa** Full `pnpm typecheck` + affected test suites green; grep for leftover mute-as-archive assumptions (`mutedAt !== null` used as "archived").
- [ ] **T-ab** After merge: close PR #4071 as superseded, link this spec on issue #3930.
