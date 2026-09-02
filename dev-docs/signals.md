# Signals

Signals are the main observability entities of the reliability system.

They group similar failed, non-errored, non-draft scores into actionable failure patterns.

> **Renamed from "Issues" (Signals spec, Phase 1).** The product and domain package are now signal-first. Some storage names remain for compatibility, most notably `scores.issue_id`, but alerting no longer uses the old issue alert-kind axis. Signal escalation incidents are first-class `incidents` rows with `source_type = "signal"`.

## Domain errors (`@domain/signals` reference pattern)

Repository-wide rules and a per-package `errors.ts` inventory are in [`./domain-errors.md`](./domain-errors.md).

The `packages/domain/signals` package is the **reference implementation** for how domain-specific errors should be organized in this repository. When adding a new `packages/domain/*` package or growing error surfaces in an existing one, mirror this layout before inventing a different structure.

**Where to look**

- `packages/domain/signals/src/errors.ts` — all package-level `Data.TaggedError` classes for this domain
- Use-cases import those classes from `../errors.ts` and fail with `yield* new SomeSpecificError({ ... })` inside `Effect.gen`

**Conventions**

- **One file per package** at `src/errors.ts` for errors that are shared across multiple use-cases in that package. Errors that truly belong to a single use-case can stay in that use-case file until a second consumer appears (see `AGENTS.md` domain conventions).
- **Specific class names** for business rules (`ScoreNotFoundForDiscoveryError`, `DraftScoreNotEligibleForDiscoveryError`), not generic `NotFoundError` / `BadRequestError` from `@domain/shared` when the failure is part of the domain vocabulary.
- **HTTP metadata on every class**: each error implements `HttpError` with `httpStatus` and `httpMessage` (static `readonly` fields or a getter when the message depends on fields). See `.agents/skills/effect-and-errors/SKILL.md`.
- **Union types per flow**: export a union (for example `CheckEligibilityError`) that lists exactly the errors a use-case or small group of use-cases can return, so callers and tests stay typed end-to-end.
- **Shared infrastructure errors** stay in `@domain/shared` (`RepositoryError`, `ValidationError`, generic `NotFoundError`, etc.); **domain semantics** live in the domain package’s `errors.ts`.

## Shared centroid model

Signals and live taxonomy both use `@domain/shared/centroid` for decayed weighted centroid math. Each domain owns its business-specific contribution weights and lifecycle, but the core invariant is shared: persisted centroids are running decayed sums, and normalized vectors are derived for pgvector search rather than treated as the canonical state. See [`./taxonomy.md`](./taxonomy.md) for the topic-cluster-tree use of the same primitive.

## Storage Split

- Postgres stores the signal row, lifecycle state, the derived `centroid_embedding` pgvector, and the generated `search_document` tsvector used for hybrid search.
- Postgres also stores the canonical score rows and signal assignment state that discovery mutates.
- ClickHouse stores immutable score analytics rows plus signal trend analytics.

## Scoring metadata

`signals.score_evidence` is a non-null JSONB list of dimension and evidence-role pairs. The canonical Signal entity requires the same list, and public project and session signal responses return it as `scoreEvidence`. An empty list means the signal is diagnostic and does not contribute to benchmark scoring. Signal evidence supports outcome, reliability, cost, speed, and safety; the signal safety roles are `confirmedHarm` and `exposure`. `successfulDefense` belongs to the broader score evidence contract but cannot classify a signal because signals represent failures.

Signal detail pages and drawers show the unique dimensions from `scoreEvidence` as chips in canonical dimension order. The Signals list renders the same chips in one row per signal and provides a URL-backed multi-select dimension filter. The session Signals tab uses the same one-row dimension chips. Multiple selected dimensions use OR semantics, and multiple evidence roles for the same dimension never duplicate a row or chip. A signal with no scoring roles, or an ignored signal, displays a Diagnostic badge with an explanation that it does not contribute to Agent Score. Ignored signals can still store a classification in the API; the badges do not present those roles as live scoring evidence. Diagnostic signals do not match dimension filters.

The database default is `[]`. Signal creation paths initialize the field explicitly, and rows that predate the column receive the empty list from the schema migration. Historical signals are not classified by a model or static mapping.

Promotion assigns `scoreEvidence` once. It samples up to 200 of the signal's newest published, failed, non-errored scores. A mapped system flagger supplies the static roles only when its slug occurs in a strict majority of the whole sample; scores with missing, unknown, or unmapped slugs remain in the denominator. Without a dominant mapped flagger, promotion stores `[]`. Generation still names the signal when enabled, but it does not classify scoring roles. If generation is disabled or fails, the unmapped path still stores `[]`. Later detail refreshes update only the name and description, so they cannot reclassify the signal.

A signal id alone does not make a score eligible for benchmark evidence. The assigned signal must be system-created and promoted, and it cannot be ignored or deleted. Resolution, muting, regression, priority, and assignment state do not affect eligibility. Benchmark readers obtain eligible signal ids from the Signal repository instead of treating every non-empty ClickHouse `signal_id` as evidence. Ignoring a signal excludes all of its assigned scores from current and future calculations without rewriting existing snapshots.

## Background Tasks

Signal discovery uses the existing Temporal-backed workflow abstraction in `apps/workflows`, while queue tasks in `@domain/queue`, `@platform/queue-bullmq`, and `apps/workers` continue to dispatch the upstream single-step triggers, including the throttled `signals:refresh` task.

The main contracts are:

- `signal-discovery` as a multi-activity workflow for one eligible non-draft failed non-errored score that still needs similarity retrieval after the centralized `signals:discovery` gate runs
- `signals:discovery` as a deduped single-step task that rechecks canonical score eligibility and chooses between selected/linked signal assignment or the fallback Temporal workflow
- `signals:refresh` as a throttled single-step task for one signal whose name/description throttle window has elapsed

Rules:

- canonical score writes emit `ScoreCreated` through the transactional outbox after commit, and the `domain-events` dispatcher publishes `signals:discovery` from that score event; the payload may carry a selected `signalId` for a published annotation
- workflow inputs carry ids only; activities re-fetch current score/signal state before acting
- throttled signal refresh relies on the `signals:refresh` queue task with logical `dedupeKey` + `throttleMs`, not on implicit BullMQ delayed/repeat jobs or persisted due-work scans — first publish schedules fire; subsequent publishes within the window are dropped
- `ScoreAssignedToSignal` is the trigger for later existing-signal detail regeneration; the dispatcher publishes `signals:refresh` keyed by the canonical signal id with the configured eight-hour throttle window (at most one refresh per signal per 8h, fires at most 8h after the first assignment)
- durable ownership and idempotency stay in Postgres via `scores.issue_id`, not in BullMQ or workflow history
- signal-generated evaluation creation is also asynchronous: kickoff starts a deterministic-id Temporal workflow and returns nothing to the caller; the frontend polls `getSignalAlignmentState`, which asks Temporal directly (`workflow.describe()` for the initial run, a query handler for in-flight manual-realignment) — there is no Redis-backed job-status key

## Lifecycle: resolve, ignore, and mute

Signals can be:

```typescript
export const SignalState = {
  New: "new",
  Escalating: "escalating",
  Ongoing: "ongoing",
  Resolved: "resolved",
  Regressed: "regressed",
  Ignored: "ignored",
} as const;

export type SignalState = (typeof SignalState)[keyof typeof SignalState];
```

- `new`: first discovered less than 7 days ago
- `escalating`: backed by an open signal-sourced incident
- `ongoing`: fallback when no other state applies
- `resolved`: manually resolved (`resolved_at` set); archived, detector keeps running unless "keep monitoring" was declined
- `regressed`: a new occurrence reopened a resolved signal (`regressed_at` set); cleared by the next resolve or ignore
- `ignored`: manually ignored (`ignored_at` set); archived, detector archived, auto-muted

A signal can be in multiple states at the same time, for example `new` and `escalating`. `resolved`/`regressed`/`ignored` are stored timestamps; the rest are derived at read time (`deriveSignalLifecycleStates`).

Three manual controls, applied by `applySignalLifecycleCommandUseCase` (`resolve`/`unresolve`/`ignore`/`unignore`/`mute`/`unmute`, batch, idempotent per command):

- **Resolve** stamps `resolved_at`, clears `ignored_at`/`regressed_at`/`muted_at` (unmuted so the regression alert can reach the user), and closes any open escalation silently (`SignalEscalationEnded` with reason `resolved`; the recovery notification is suppressed for manual closes). The effective `keepMonitoring` (input ?? project → org → system setting, default true) decides whether linked evaluations keep running; `false` soft-deletes them.
- **Ignore** stamps `ignored_at`, clears `resolved_at`/`regressed_at`, **auto-mutes** (`muted_at` set if null), always soft-deletes linked evaluations, and closes any open escalation with reason `ignored`. Ignored signals are skipped by escalation checks entirely, but remain valid discovery match candidates so their noise keeps flowing into one bucket. Unignore releases the mute along with `ignored_at`, so notifications come back with the signal.
- **Mute** (`muted_at`) is a pure **notification barrier**: escalation checks still run and incidents still open/close while muted; only notification fan-out and agent dispatch are suppressed. It never touches the other stamps, and resolve/unresolve/unignore never touch it.

Resolve and ignore are mutually exclusive; the un-commands never resurrect soft-deleted evaluations (re-track or re-author instead). The mute rule: only an explicit mute or an ignore sets `muted_at` — resolve, unresolve, and unignore all clear it, so no lifecycle transition leaves a signal silently muted. `archived` in the UI/API (`lifecycleGroup`) means `resolved_at IS NOT NULL OR ignored_at IS NOT NULL`; muted-only signals are active.

`applySignalLifecycleCommandUseCase` is also driven **externally** by the GitHub integration ([`github-integration.md`](github-integration.md)): a PR or commit that references a signal's slug and lands on a monitored branch auto-resolves (or, on a revert/reopen, unresolves) the signal, calling the same command with no actor attribution — provenance lives on the reference row, not the signal. This is why slugs are **organization-unique** (`(organization_id, slug) WHERE deleted_at IS NULL`, spanning projects): a GitHub reference resolves to exactly one signal org-wide.

**Regression.** A new occurrence on a resolved signal reopens it: `resolved_at` is cleared, `regressed_at` is stamped, and `SignalRegressed` (with `triggerScoreId`) drives the `signal.regressed` notification (assignee-first, mute-gated) plus an agent-dispatch request for configs subscribed to the `signal.regressed` trigger. Both occurrence paths hook in — discovery assignment (`assignScoreToSignalUseCase`, under the signal row lock) and the live-evaluation writer (`runLiveEvaluationUseCase`, via the race-safe `claimReopenOnOccurrence` conditional UPDATE guarded on "resolved, not ignored, resolved before the occurrence"). Exactly one writer per regression cycle wins the claim and emits the event; replayed historical scores cannot reopen. Escalation `enter` on a resolved signal also reopens it (sets `regressed_at`) but emits no separate `SignalRegressed` — the escalation notification announces the recurrence.

The `escalating` state is backed by an open incident with `source_type = "signal"` and `source_id = signal.id`. A seasonal detector opens/closes that row through `EscalationEngine`; closes fire on the absolute-rate backstop, a band-shape + dwell recovery, or a hard timeout. Signals with no seasonal history use the same band-shape + dwell exit on the close side, so they de-escalate shortly after going quiet.

Important state timestamps:

- `clusteredAt`: last centroid/cluster refresh
- `resolvedAt` / `ignoredAt`: manual archive stamps, or `null`
- `regressedAt`: last occurrence-driven reopen, or `null`
- `mutedAt`: manual notification mute timestamp, or `null`

## Feedback: was this signal worth raising?

Nothing else in the product asks the customer whether a signal was a real problem — resolve/ignore rates and the reviewer LLM's own rejections are proxies. `signals.feedback` is the direct question, answered once per signal.

The column is a single nullable JSONB holding the core of a Latitude score, because a verdict on a signal **is** a score: `{ value, passed, feedback }`. 👍 is `passed: true, value: 1`; 👎 is `passed: false, value: 0`; the reason is `feedback` (empty when a 👍 was saved bare). `null` is the whole "not graded yet" state, and it doubles as the immutability latch. Nothing records who graded it or when: no consumer reads either, so the row does not carry them.

`submitSignalFeedbackUseCase` (`@domain/signals`) is the one seam, called by the web server fn and by the `submitSignalFeedback` operation (REST + MCP + SDK + CLI):

1. Read the signal through the default-deny visibility filter, so an unpromoted or deleted signal cannot be graded, and reject a cross-project id.
2. Refuse a signal no flagger detected (`SignalFeedbackNotSupportedError`, 422) — the verdict measures how well Latitude flags, so only Latitude's own detections are gradable.
3. Reject a `passed: false` submission whose trimmed reason is empty (`SignalFeedbackReasonRequiredError`, 422). A false positive without a reason cannot be acted on; a confirmation without one is still useful.
4. `SignalRepository.claimFeedback` — one conditional `UPDATE … WHERE id = ? AND feedback IS NULL`, returning whether **this** call wrote. `false` ⇒ `SignalFeedbackAlreadySubmittedError` (409). The claim is what makes immutability true under concurrency (two tabs, a UI click racing an MCP call) rather than merely usually true; `save` deliberately omits `feedback` from its upsert set so a writer holding a pre-verdict copy cannot clear the latch.
5. `SignalFeedbackSubmitted` goes to the outbox in the same transaction. Feedback is one-shot, so if the fan-out were a publish from the request path and Redis blinked, there would be no way to ask again.
6. `ignore: true` then runs `applySignalLifecycleCommandUseCase("ignore")` — the `Save and ignore` shortcut, so a 👎 is also the fastest path to a clean list. The verdict is claimed **before** the archive: a lifecycle failure surfaces as an error with the verdict standing, and ignoring is one more click from the header.

Downstream, `SignalFeedbackSubmitted` fans the verdict out as human annotations onto Latitude's own flagger generations in `latitude-flaggers` — never onto the customer's traces. See [`./flaggers.md`](./flaggers.md#grading-a-flaggers-own-decisions).

**Surface.** The signal detail header carries two thumb buttons, right-aligned under the action row (`ListingLayout.Header`'s `titleAside` slot). Clicking one opens a popover with a reason textarea; 👎 requires a reason and offers `Save and ignore` (primary) plus `Save`, 👍 offers `Save` alone. After saving, the control collapses to the chosen thumb — filled, disabled, with the reason as its tooltip — for every viewer and every later session. The control renders only on signals a flagger detected (`source: "flagger"`), and the use-case refuses anything else (`SignalFeedbackNotSupportedError`, 422). A hand-written or annotation-born signal has no decision of ours behind it, so there is nothing for the verdict to grade.

## Signal Source

The `source` field records the provenance of the **first score** that created the signal. It is immutable for the lifetime of the signal.

```typescript
type SignalSource = "annotation" | "flagger" | "custom";
```

- `"annotation"` — the signal was born from a human annotation (UI, API, or a published queue annotation).
- `"flagger"` — the signal was born from a Latitude-authored flagger annotation.
- `"custom"` — the signal was born from a custom score pushed through the API. The creating score carries `source: "custom"`.

> **Note**: `"evaluation"` is intentionally excluded. Evaluation scores are always linked to an existing signal at creation time; they never spawn a brand-new signal.

The derivation rule applied at signal creation time:

```typescript
const deriveSignalSource = (score: Score): SignalSource => {
  if (score.source === "annotation") {
    return "annotation";
  }
  if (score.source === "flagger") {
    return "flagger";
  }
  return "custom";
};
```

Signal creation eligibility:

- annotations are the primary signal
- annotation flows can also link to an existing signal explicitly; that human choice is carried as selected signal intent once the draft is published and then resolved by the centralized `signals:discovery` task
- failed scores from evaluations that are not already linked to an signal may also create new signals
- failed custom scores may also create new signals

## Origin and user-created signals

`origin` is a distinct, immutable axis from `source`. `source` records *which score-mechanism* first created a discovered signal (`annotation` | `flagger` | `custom`); `origin` records *who* created the signal:

```typescript
type SignalOrigin = "user" | "system";
```

- `system` — auto-generated by discovery. Annotation-assignable (even after it's tracked with an evaluation). Every pre-PR3 signal is backfilled to `system`.
- `user` — hand-built by a person via the API/MCP (`createSignalUseCase`). Never annotation-assignable; its membership comes solely from its evaluation. Carries `source: "custom"` (no creating score) and **no centroid** (`centroid`/`clustered_at` are null — only discovered signals cluster).

Tell auto-generated from hand-built by `origin`, never by the presence of an evaluation: a tracked `system` signal has an evaluation but stays `system`.

A `user` signal **must** have an evaluation. `createSignal` accepts `evaluation.settings` (a declarative form, compiled to a script — `kind: "judge"` is the first) **or** `evaluation.script` (raw, advanced). The script is validated in the QuickJS sandbox at save time (`ScriptCompileError` → HTTP 422). The evaluation collects forward only: from creation onward it scores new incoming traces through the normal `signals:match` → `live-evaluations:execute` path — there is no historical backfill. See [`dev-docs/evaluations.md`](evaluations.md) for `settings`/`script_hash`/active-detector details.

`rule` settings support a `semantic_similarity` condition ("is this conversation about frustration?") backed by the `semanticSimilarity(query)` sandbox verb, which reuses the trace's ingest-time `message_embeddings` and embeds only the query (once per distinct string). Such evaluations pass through a readiness gate on the `live-evaluations:execute` path so they run after embeddings are indexed; see [`dev-docs/evaluations.md`](evaluations.md).

**Describe-first creation (the builder's default).** The builder modal opens on a single textarea; `createSignalFromPromptUseCase` (`@domain/signals`) drafts the complete signal — name, description, filters, sampling, and a `rule` > `judge` > `script` evaluation (in that preference order, so the result stays form-editable) — grounded in observed project data: distinct filter-dimension values (tags/services/models/providers/tool names via `TraceRepository.distinctFilterValues`), traffic volume, and one sample session. Each draft is schema-mapped, compile-checked, and previewed via `previewEvaluationUseCase`; failures feed a repair turn and one verdict-review turn lets the model confirm or revise (≤ 4 generate calls). On success it composes `createSignalUseCase` — the signal is created immediately (no review step; the user iterates via Edit on the detail page). Because AI runs only in workers, the web enqueues `signals-generate-signal` and polls a Redis result at `org:${organizationId}:signalGeneration:${generationId}` (pending results carry a `step` progress line; a `:claim` key makes stall-recovery redeliveries no-ops so a run never creates two signals). The user's prompt is not persisted. Filters are generated only as a cost pre-gate — when they discard sessions that *for sure* cannot match — never as part of the detector's semantics; "Configure manually" remains the path into the step-by-step wizard.

Lifecycle:

- **Update** (`updateSignalUseCase`) edits `name`/`description`/`filters`; filter changes apply forward-only and the slug is stable. Triage (priority/assignee) and resolve/ignore keep their own use-cases.
- **Level.** `signals.priority` holds the shared `ALERT_SEVERITIES` scale (`low` → `urgent`), so a signal's level and a monitor's severity are one vocabulary; the field name stays `priority` because it is public API. The level flows on to the notification payloads as `severity` (see `dev-docs/notifications.md`) and sets the severity of the signal's escalation incidents. **No level means no notification** — no email, no Slack. Agent dispatch is untouched by this and keeps its own rules.

  **Level.** `signals.priority` holds the shared `ALERT_SEVERITIES` scale (`low` → `urgent`), so a signal's level and a monitor's severity are one vocabulary; the field name stays `priority` because it is public API. The level flows on to the `signal.discovered` / `signal.regressed` notification payloads as `severity` (see `dev-docs/notifications.md`), so a Slack route's minimum severity and a user's `emailMinSeverity` filter signals the same way they filter monitor incidents.

  **Nothing assigns it automatically.** A discovered signal is created with `priority: null` and stays there until somebody triages it through `updateSignalTriageUseCase`. An automatic rating was built and removed before merge: any heuristic — a model reading the occurrence, or a level derived from measured volume — is going to disagree with what a particular customer expected, and a level that moves on its own is one nobody can reason about. Noisy discovery notifications are a notifications problem, to be solved with per-project opt-outs and digest delivery rather than by guessing a priority.

  A payload with no severity is admitted by every threshold, so an untriaged signal notifies exactly as it did before this change. Filtering only starts to apply once a human has said what a signal is worth.

- **Delete** (`deleteSignalUseCase`) **soft-deletes** the signal (`deleted_at`) and **archives** its active evaluation so the matching pipeline stops running it. No ClickHouse cleanup — deleted-signal scores linger and are excluded read-side (every signal read filters `deleted_at IS NULL`); the slug becomes reusable (the slug-unique index is partial on `deleted_at IS NULL`).

REST surface: `POST /` (create), `PATCH /{signalSlug}` (update), `DELETE /{signalSlug}` (delete), under `/v1/projects/{projectSlug}/signals`. Regenerate the SDK/MCP with `pnpm generate:sdk` after route changes.

## Manual Linking From Annotations

Signal discovery is not the only entrypoint.

When annotating in managed UI, the annotator may:

- leave signal assignment automatic
- link the annotation to an existing signal

Inline manual signal creation from the annotation flow is intentionally deferred for now to keep the managed annotation UX and ownership rules simpler.

For explicit link actions:

- while the annotation is still drafted, keep the selected signal only as editable draft intent
- skip similarity-based candidate selection for that annotation score once the draft is published
- publication clears `draftedAt`, emits `ScoreCreated` with the selected `signalId`, and the centralized `signals:discovery` task performs the canonical ownership claim, centroid mutation (which transparently refreshes the derived `centroid_embedding` inside `SignalRepository.save`), refresh event write when needed, and analytics sync
- treat the signal as annotation-backed evidence immediately after publication

## Discovery Pipeline

Signal discovery should follow the original proposal closely:

1. observe a non-draft failed, non-errored canonical score in Postgres
2. emit `ScoreCreated` after the canonical Postgres write commits; that payload may carry a selected `signalId` for published annotations
3. let the deduped `signals:discovery` task recheck canonical eligibility and decide whether a selected signal or signal-linked evaluation should be assigned directly before any similarity search runs
4. enrich annotation-originated feedback first when needed, while preserving the original annotation text as `metadata.rawFeedback`
5. embed canonical feedback with `voyage-4-large` at `2048` dimensions; for annotation scores whose raw text differs from the enriched canonical feedback, also embed the raw feedback for fallback retrieval
6. run project-scoped hybrid search directly against Postgres signals using pgvector cosine relevance plus `english` full-text rank
7. use the fixed weighted fusion (`0.75` vector, `0.25` lexical) and keep candidates that pass either the `0.8` hybrid threshold or the `0.75` vector-only semantic threshold
8. rerank candidates with `rerank-2.5`
9. filter out candidates that do not pass the minimum rerank relevance threshold
10. when enriched-feedback retrieval/rerank finds no match and raw annotation feedback is available, repeat the same retrieval/rerank pass with raw feedback before allowing new signal creation
11. match an existing canonical signal id or create a new signal when the centralized gate did not already route to a known signal
12. when the final path is a brand-new signal, generate the first signal name/description synchronously from the initial signal occurrence inside the dedicated create-from-score workflow activity before starting the create transaction
13. write `scores.issue_id` in Postgres
14. if the score was added to an existing signal, write `ScoreAssignedToSignal` transactionally so later signal-details regeneration can debounce safely
15. after the transaction commits, run `syncScoreAnalyticsUseCase` directly so the immutable score reaches ClickHouse without waiting for another async hop
16. refresh signal name/description asynchronously on debounce only for the existing-signal path that requested `ScoreAssignedToSignal`, reusing the shared signal-details generation use case against the last `25` assigned occurrences plus the previous persisted details as the stabilization baseline; the refresh returns early while the signal is unpromoted, and the promotion-time generation is the one call that drops that baseline

Execution rules:

- `signals:discovery` runs first after an eligible non-draft failed non-errored score write commits
- scores already written with `issue_id`, including direct-owned live signal-linked monitor failures, short-circuit before retrieval/rerank; retries through `signals:discovery` may still replay analytics sync idempotently
- `signal-discovery` runs only when that centralized gate still needs retrieval/rerank work
- when initial workflow retrieval resolves to no known signal, the workflow must call the bounded locked serialization activity instead of creating an signal directly
- `signals:refresh` runs after the configured throttle window elapses for an existing signal
- both the workflow and the debounced task must re-check current ownership/lifecycle state before doing expensive work
- in workflow orchestration, do feedback embedding first and then enter locked serialization; annotation scores may carry both enriched and raw feedback embeddings, and the search/rerank/create-or-assign decision runs under the Redis serialization gates
- the brand-new signal path must **not** generate a name/description; it writes a deterministic placeholder built from the creating occurrence's feedback, and the first generated summary is produced at promotion through the same shared signal-details generation use case that later debounced refreshes call (see § Denoising: promotion)
- the debounced `signals:refresh` path must re-lock and re-read the canonical signal row before saving generated details so it cannot overwrite a newer centroid or lifecycle update
- after `signals:refresh` persists changed details, no explicit search sync is required because Postgres derives `search_document` from canonical signal text
- rerank results already carry canonical signal ids from Postgres search, so there is no projection UUID resolution step
- the no-match path is only provisional; before creating a new signal, serialization must first acquire a feedback-scoped Redis lock and re-run hybrid search and rerank, trying enriched feedback first and raw annotation feedback second when raw feedback is available
- if the feedback-scoped re-check still finds no signal, serialization must acquire the project-scoped Redis lock and re-run the enriched-then-raw retrieval sequence again before creating
- each Redis lock acquisition must be non-blocking; if the lock is already held, serialization returns a lock-unavailable result so the workflow sleeps durably and retries at that point instead of holding a database connection while waiting
- both the create-from-score step and the assign-to-signal step must use a conditional `scores.issue_id` claim so only one concurrent owner wins while the canonical signal row and centroid stay transactionally consistent
- the assign-to-signal path must lock the canonical signal row before recomputing and saving the centroid so parallel score assignments into the same signal do not lose centroid contributions
- muted, resolved, and ignored signals are still valid discovery match candidates; new occurrences keep attaching (and reopen resolved signals) instead of spawning duplicates

### Bounded locked serialization

Postgres pgvector search is canonical, but concurrent workers can still both observe no sufficiently similar signal before either creates a new row. A fuzzy no-match result is therefore not sufficient authority to create a new issue.

The no-match branch must enter `assignOrCreateSignalUseCase`, which uses layered Redis locks. A feedback-scoped lock serializes identical feedback strings from the same score source/source id, reducing deterministic-flagger herds before external retrieval work. A project-scoped lock serializes brand-new signal creation attempts for the project, so differently worded but semantically duplicate no-match workflows do not create concurrently.

Inside locked serialization must:

1. re-fetch the score by id
2. acquire the feedback-scoped Redis lock
3. re-run hybrid signal search against Postgres using the enriched canonical feedback and normalized embedding
4. re-run rerank over enriched-feedback candidates
5. if no match is found and the score is an annotation with distinct raw feedback, repeat hybrid search and rerank with the raw feedback and raw-feedback embedding
6. assign the score to the matched signal if either locked re-check finds one
7. otherwise acquire the project-scoped Redis lock and repeat the enriched-then-raw retrieval/rerank sequence
8. assign to the project-lock match if one is found
9. otherwise generate signal details, create one new signal, and claim `scores.issue_id`

This intentionally moves the long external retrieval/rerank/generation section outside Postgres transactions. Lock acquisition must use Redis `SET ... NX EX`; if the key is already held, serialization exits immediately and the workflow performs an explicit sleep-and-retry loop instead of occupying a database connection as a lock waiter. Redis lock keys must be organization-prefixed (`org:${organizationId}:...`) and released with token comparison so one worker cannot release another worker's lock after TTL expiry.

The correctness invariant is:

- the feedback-scoped lock is acquired before the project-scoped lock to reduce deterministic-flagger herds
- contended workers retry instead of waiting on Postgres or holding database transactions
- project-level brand-new signal creation is serialized by the Redis project lock
- assignment to an existing signal remains row-safe through the signal row lock and conditional score ownership claim
- fuzzy no-match races can still create duplicates unless brand-new signal creation is serialized by Redis locks

Concrete v1 mechanics worth carrying forward:

- eligibility was strict: non-draft, failed, non-errored, clusterable feedback/reason present, and not already owned by another active signal
- hybrid search used the same canonical feedback as both the keyword query and the embedding source
- the proven v1 defaults were `alpha = 0.75`, minimum similarity `0.8`, minimum BM25 matches `1`, initial candidate limit `1000`, rerank limit `20`, and minimum rerank relevance `0.3`
- even a single candidate still went through reranking so the threshold could reject it
- once an evaluation is linked to an signal, live monitor failures may already be written with `scores.issue_id` claimed at creation time; unowned evaluation-originated failures that still reach `signals:discovery` should have the centralized gate resolve the linked signal directly before similarity search starts

Current v2 starting defaults layered on top of those v1 learnings:

- rerank limit: `100`
- retrieval admits candidates that meet either the fused hybrid threshold (`0.8`) or a vector-only semantic threshold (`0.75`) so low-lexical-overlap candidates still reach reranking
- annotation discovery uses enriched feedback first, then raw feedback as a fallback retrieval/rerank pass before signal creation
- signal details regeneration throttle: `8 hours` (at most once per signal, fires at most 8h after the first assignment)
- keep the low-evidence visibility threshold configurable instead of hard-coding it into the signal model

Important v2 correction:

- v1 could still race the same failing result into multiple active signals under concurrency; v2 must keep canonical single ownership in `scores.issue_id`

Legacy v1 reference paths for discovery/search:

- `packages/core/src/voyage/index.ts`
- `packages/core/src/services/signals/results/validate.ts`
- `packages/core/src/services/signals/discover.ts`

Before using those paths, checkout branch `latitude-v1` in the old repository and read them from its root.

## Centroids

```typescript
type ScoreSource = "evaluation" | "annotation" | "custom";

type SignalCentroid = {
  base: number[]; // running vector sum of normalized, weighted, decayed member embeddings
  mass: number; // running scalar mass of the centroid
  model: string; // embedding model used to compute the centroid
  decay: number; // half-life in seconds
  weights: Record<ScoreSource, number>; // source weights used in centroid updates
};
```

Centroids are running weighted sums with decay. They are not full historical re-averages.

The preserved math shape from v1 is:

- decay the previous centroid state before every update
- normalize each incoming embedding before contributing it
- add or subtract a weighted, time-decayed contribution from `base`
- track the scalar accumulator in `mass`
- normalize `base` only when emitting the vector for search (the derived pgvector column is materialized inside `SignalRepository.save` from the JSONB centroid)

Important v2 corrections:

- use `clusteredAt`, not a generic row `updatedAt`, as the decay anchor
- pin `model`, `decay`, and `weights` on the centroid config and rebuild if they change
- remember that v1 weights were keyed by evaluation type, while v2 intentionally remaps them onto score sources
- fail fast on embedding-dimension mismatches
- if removal underflows, zero or rebuild the centroid instead of leaving an invalid negative state
- centroid updates and derived `centroid_embedding` maintenance live entirely inside Postgres; there is no external vector store dependency on the write path

Legacy v1 reference path for centroid math:

- `packages/core/src/services/signals/shared.ts`

Before using that path, checkout branch `latitude-v1` in the old repository and read it from the repository root.

Recommended initial weights:

- annotations: `1.0`
- evaluations: `0.8`
- custom: `0.8`

Recommended initial half-life:

- `14 days`

These thresholds, weights, half-lives, and other tunables should be defined as named constants inside `packages/domain/signals` rather than as scattered inline literals.

## Denoising: promotion

**A discovered signal is not real until it has been seen in enough distinct sessions.** `signals.promoted_at` is a one-way latch: null means the signal was discovered but has not yet earned its place, non-null means it has. The latch is never cleared — a promoted signal that goes quiet is handled by resolve / ignore / mute, not by demotion, because demotion would let a signal a person has already triaged silently vanish, and would let one signal announce itself twice.

Deliberate human intent promotes without evidence. A signal created by a person (`origin = 'user'`) is born promoted, as is any signal created through the API's `createSignal`. Nobody can track an unpromoted signal with an evaluation, because nobody can reach one. Everything else has to accumulate evidence.

**The evidence unit is distinct sessions, not scores.** One long session can trip the same flagger many times and one trace can carry several annotations; none of that is independent evidence. A score with no `session_id` counts as its own session keyed by `trace_id`, and failing that by its own id, so annotations from non-session instrumentation still count exactly once (`ScoreRepository.countDistinctSessionsBySignalId`).

**The threshold scales with the project's traffic**, because a flat number is wrong in opposite directions at the two ends. In a project doing thousands of sessions a day, two independent false positives of the same kind inside one window stop being a coincidence, so a flat `2` would promote noise that only repeated by chance. In a project doing a few dozen sessions a month, a chronic problem may never put two occurrences inside the window, so a flat `2` would bury a true positive. Hence `promotionThreshold(sessionsInWindow)`: a floor, a term proportional to volume, and a cap (`PROMOTION_*` constants in `@domain/signals`). The cap exists because uncapped the proportional term reaches ~1,500 sessions for a 3M-session month, which does not make discovery stricter for a large customer but switches it off for them.

**Promotion conditions are uniform.** No flagger slug is special-cased, no human annotation short-circuits the count, and no severity or model rating is consulted. Accepted consequence: in a high-traffic project a `pii-leakage` or `jailbreaking` finding needs the full threshold before it is announced. A slug-keyed safety exception was considered and rejected — per-flagger behavior in the promotion rule cannot be explained or tuned, and such a list only grows. If safety findings need to reach a user sooner, that belongs in the flagger or in notification routing.

**Where it runs.** `assignScoreToSignalUseCase`, split across the transaction boundary by what each step is allowed to touch:

1. An unlocked `findById` pre-read. A signal that is already promoted stops here, before anything else runs. This is the load-bearing step: a promoted signal can hold hundreds of thousands of scores and `scores_signal_lookup_idx` does not cover `session_id`, so counting one would mean a heap fetch per row on the ingestion hot path. Promotion is a one-way latch, so this read can only be stale in the harmless direction.
2. For an unpromoted signal, the project's session volume, read through a TTL cache (`org:${organizationId}:projects:${projectId}:session-volume`) populated on miss from ClickHouse. This happens *before* the transaction because it touches Redis and ClickHouse, neither of which belongs inside a Postgres transaction. A failure at either layer degrades to the floor, so an unavailable cache can only make promotion easier, never suppress a signal.
3. Inside the existing transaction and per-signal lock that already serialize centroid updates and the regression claim: re-check the latch, count distinct sessions, compare against the threshold, and write.

The count therefore comes *after* volume resolution rather than gating it. Counting first would need the count outside the lock to be authoritative, and it cannot be: the count has to include the score being claimed in this transaction. The cost of that ordering is one cached read per assignment to an unpromoted signal, on a path that already takes a distributed lock.

Crossing the threshold stamps `promoted_at` and emits `SignalPromoted`.

**An unpromoted signal is indistinguishable from one that does not exist.** No UI surface, no tab, no badge, no API representation, no automation. Enforcement is a **default-deny filter in `SignalRepository`** rather than a check in each of the dozen use-cases downstream: twelve call sites that have to remember the filter is twelve chances to leak a candidate, and the next read path added would leak by default. `userVisibleSignal` in the adapter carries the rule, so the list, its counts and histogram, the detail page, the command palette, Related, session and user reads, the CSV export, and every API, MCP, SDK and CLI response drop candidates for free — the hydrating reads (`findByIds`, `findBySlug`) already tolerated a missing row. A project holding nothing but candidates reads as an empty project and shows onboarding.

Four reads sit on the discovery side and pass `includeUnpromoted`. Three of them fail *silently* without it, which is why each carries a comment naming the failure: the promotion pre-read (the latch would never fire again), `resolveKnownSignalId` (an evaluation-linked score would spawn a second signal instead of adding evidence to the first), `generateSignalDetailsUseCase` (the throttled `signals:refresh` runs for candidates too, so every refresh would fail), and discovery's `hybridSearch` (the one read that has to see candidates, since matching into one is how it earns promotion — the signals-list search box calls the same method without the opt-in). Two reads stay unfiltered beyond soft-delete on purpose: `countBySlug` and `existsBySlug` back slug generation, and a candidate holds its slug for real.

**Consequences fire at promotion, not at creation.** The `signal.discovered` notification and the `signal.discovered` agent dispatch both hang off `SignalPromoted`; `SignalCreated` stays registered and inert as an audit fact. Nothing user-visible was renamed — same kind, same trigger, same templates, same project gate, and existing dispatch configs are untouched. Escalation skips an unpromoted signal that is not already escalating, so an incident cannot route around the gate. The "not already escalating" half is deliberate: an unpromoted signal holding an open incident should be unreachable, but returning early there would strand that incident forever, because even the duration timeout exits from inside the detector. Falling through cannot announce anything, since entry requires the signal not to be escalating already. `isSignalNew` anchors on `signalFirstVisibleAt` (promotion, falling back to creation), so a signal discovered on day 0 and promoted on day 20 is new on day 20 — and arrives with a warm escalation baseline rather than a cold-started one.

Enforcement landed as a straight cutover with no feature flag: a flag would put a branch on every read path and leave a dozen places to un-branch later. The **constants are the kill switch** — `PROMOTION_MIN_SESSIONS = 1` with `PROMOTION_RATE_FLOOR = 0` reproduces the pre-gate behaviour as a config change rather than a revert. For that to be true the gate is evaluated at *creation* as well as on assignment: a creating score is one session, so a signal is born promoted wherever the floor admits one. Without that, promotion would only ever be evaluated when a second score arrived and the floor would effectively be 2 whatever it was set to. Testing the constant before resolving volume keeps the extra lookup off the creation path in every configuration that cannot use it, including the default. Both the migration that added `promoted_at` and the one that enforced it backfill `promoted_at = created_at`, so the gate only ever applied to signals discovered after enforcement shipped. The consequence to communicate: a complaining customer's existing list does not get cleaner on deploy, it stops getting worse. Cleaning the backlog is a separate bulk resolve/ignore.

**Naming follows the same line.** A candidate is named deterministically from its first occurrence — the truncated first sentence of the feedback as the name, the feedback itself as the description — with no model call on the creation path at all. Summarizing a cluster from its single first member is not a well-posed task, and asking a model to do it produced exactly that answer in production: signals titled `description`, and one whose description was the model explaining that one occurrence is not enough to identify a shared pattern. The real summary is generated once, over the whole cluster, when the signal is promoted.

The placeholder survives until then, because `refreshSignalDetailsUseCase` returns early while `promoted_at` is null. `ScoreAssignedToSignal` schedules the throttled `signals:refresh` for candidates too, and without that guard a candidate picking up a second score is renamed by a model eight hours later — spending a call to make matching worse, since it swaps the occurrence's own feedback for a generalization drawn from the one or two members that make the summary ill-posed.

**Passing the gate and being promoted are two different facts, and two different events.** The transaction that observes the evidence emits `SignalQualifiedForPromotion` and stops there: `promoted_at` stays null, so the signal stays invisible. `issues:promoteSignal` then generates the summary from the whole cluster, stamps the latch and emits `SignalPromoted` in one transaction, and the announcements hang off *that*. Before it stamps, it re-reads the distinct session count against the same volume-scaled threshold, so a delayed job cannot promote after the evidence that queued it was removed. The in-transaction recount locks those score rows, so a concurrent annotation delete waits instead of landing between the count and the stamp. A signal is never visible carrying the raw feedback sentence it was created from, and `SignalPromoted` is fully formed for everything downstream — which matters because agent dispatch builds its Cursor prompt from the name and description, and Slack renders once at send time. (The in-app renderer and the email are safe either way: the payload carries no name, so they resolve it live.) Splitting the two facts is what lets promotion wait on a model call that cannot run inside the gate's transaction. The generation is asked to ignore the signal's current details, since using the placeholder as the stabilization baseline would anchor the first real summary to one member's phrasing.

Two consequences worth knowing. Until the latch is stamped every further score re-qualifies and re-emits, so the consumer publishes under a **leading throttle** rather than a bare dedupe key — a bare key becomes a BullMQ job id, failed jobs are retained, and a permanently failed promotion would shadow every later publish so the signal could never promote at all. And generation failure never blocks promotion: `promoteSignalUseCase` promotes under the placeholder and lets the now-unblocked refresh correct the name, because a signal held back by a failed model call is invisible with nothing scheduled to retry it.

### Consolidation: fragments that could never qualify apart

The gate alone would suppress a real problem that discovery split across several one-session signals, because no fragment reaches the threshold on its own. **Consolidation merges near-duplicate candidates into one**, so the union faces the gate that the pieces could not.

It is candidate-to-candidate, and the repository is what enforces that: the neighbor scan runs `findSimilarByCentroid({ unpromotedOnly: true })`, which inverts the default-deny rule on *both* sides rather than relaxing it, so a promoted signal is neither absorbed nor picked as a survivor. Two promoted signals are never auto-merged — that is the retired v1 merge system. Merging candidates needs no "merged" state because nothing points at a candidate: it was never announced, assigned, escalated, or linked from a pull request, which is exactly what makes a real merge safe here.

Matching is **centroid-only, and must stay that way**. Consolidation exists to catch what live matching rejected, and what live matching rejected was rejected largely by the rerank gate over name and description — the channel a candidate's placeholder makes unreliable. Re-applying that gate here would make the pass a no-op by construction. The floor is a separate, looser constant (`CONSOLIDATION_MIN_SIMILARITY`), and "looser" needs care: centroid-to-centroid compares two averages, so noise cancels on both sides and a numerically equal floor would be *stricter* than discovery's score-to-centroid comparison.

A pass runs from a throttled `issues:consolidate` publish, triggered wherever a candidate's centroid changes — at creation, and on an assignment that left it unpromoted. `ScoreAssignedToSignal` carries `unpromoted` for that second trigger, read under the row lock: at volume almost every assignment is to a promoted signal, and publishing for those would enqueue a job per signal per window for a handler that could only return. The throttle is trailing, which also keeps a candidate that qualified in the same transaction from being consolidated out from under its own promotion.

Then, in order: neighbors above the floor, capped at `CONSOLIDATION_MAX_MERGES_PER_PASS`; the per-signal lock for **every participant**, in ascending id order; and one transaction that re-reads them under those locks, picks the survivor (most distinct sessions, then oldest, then lowest id), moves the losers' scores, folds their centroids in with `mergeCentroids`, soft-deletes them, and re-qualifies the survivor. The cap is the guard on the one irreversible failure mode in the whole design — a mis-set threshold with no ceiling collapses a project's candidate pool into one meaningless signal, and there is no demerge. Locking the losers matters as much as locking the survivor: an unlocked loser can take a concurrent assignment while the merge reassigns its scores and deletes it, stranding that score on a deleted row.

The survivor keeps its placeholder name. If the merge carries it over the gate, promotion names it from the merged cluster — which is the point at which a fragmented problem finally gets one title.

**The merge spans two stores.** Postgres decides promotion, but occurrences, affected sessions, impact and the trend all read ClickHouse, so a Postgres-only merge would announce a signal whose occurrence count shows part of its evidence. The merge transaction writes a `SignalsConsolidated` outbox event, and its consumer runs one bounded `ALTER TABLE scores UPDATE`. That event cannot be a call placed after the commit: the merge is idempotent precisely because a re-run finds the losers soft-deleted and no-ops, so a crash between the two stores would leave the loser's rows under a deleted id forever. The event carries identity only: what the mutation sweeps is resolved from Postgres when the job runs, by walking `signals.merged_into_signal_id` from the survivor. That pointer is stamped as the merge soft-deletes each loser, and it is what makes two chained merges converge. `B → A` followed by `A → C` publishes two independent jobs and BullMQ orders neither, but the merge that absorbs a former survivor sweeps that survivor's own absorbed ids too, so whichever job runs first covers what the other may not have moved yet. Without it, running `A → C` first leaves B's rows on a soft-deleted `A` permanently. The mutation's `created_at` lower bound comes from the survivor's earliest score, never from the losers' own `created_at` — a replayed annotation is older than the signal it was later assigned to, and a sweep set spanning several merges reaches further back than any one of them. `scores_hourly_buckets` is deliberately **not** reconciled: it is an AggregatingMergeTree fed by a materialized view, the only available mechanism is an additive `INSERT … SELECT` that double-counts on retry, and its `SimpleAggregateFunction(sum, UInt64)` column cannot take a compensating negative. The cost is confined to seasonal escalation baselines, self-heals as new scores land, and `isSignalNew` already excludes the signal from escalation for `NEW_SIGNAL_AGE_DAYS` after promotion.

### Expiry: candidates that stopped accumulating

Discovery accumulates rows forever, and every `signals` row carries a 2048-dim centroid that `hybridSearch` scans exactly, with no ANN index by design. A candidate that never accumulated evidence is provably something nobody has seen, so it can be dropped without anyone noticing — which makes expiry the first mechanism that lets the corpus shrink instead of only grow.

A daily cron soft-deletes candidates idle for `CANDIDATE_EXPIRY_IDLE_DAYS`, measured from `clustered_at` (the anchor the centroid itself decays from) rather than `updated_at` (which a throttled refresh also bumps). The window sits past `PROMOTION_WINDOW_DAYS` because promotion is only ever evaluated on score assignment: a candidate idle for a full window is provably dead, and the grace beyond it keeps a late score clustering into the existing candidate instead of starting a fresh one. Promoted signals are never swept.

**Expired candidates keep their scores attached.** `check-eligibility` rejects a score that already carries a `signal_id`, so leaving them attached is what stops the sweep feeding the same annotations back into discovery forever. The signal is soft-deleted, so the evidence simply stops existing; if the same problem recurs it starts a fresh candidate, which is correct and self-correcting. The sweep is one capped `UPDATE` per tick on the admin client with no per-signal fan-out — an unpromoted signal has no consequences to unwind — backed by `signals_candidate_idle_idx`, whose predicate is the exact complement of the user-facing lifecycle index. Soft-delete also frees the slug, so expiry recycles the `PRE-XXXX` space.

Full design, decisions, and open parameters: `specs/signal-promotion.md`.

## Naming

Signal names and descriptions are summaries, not the cluster identity itself.

The actual cluster identity is driven by:

- centroid state
- incoming occurrence stream
- assignment history

Required Postgres storage on the signal row:

- `uuid` column kept as dormant legacy data; it defaults to `gen_random_uuid()` at the DB level and is not part of the `Signal` domain entity or any application read/write path
- nullable `centroid_embedding vector(2048)` derived from the canonical JSONB centroid; empty/no-evidence centroids store `NULL`
- generated `search_document` using the `english` text-search configuration over weighted `name` (`A`) and `description` (`B`)
- btree on project-scoped signal list columns so list reads can filter by organization/project and order by activity
- GIN index on `search_document` for lexical boost in hybrid search
- no IVFFlat/HNSW index on `centroid_embedding`: signals per project are expected in the hundreds to low thousands, and an exact project-scoped sequential scan outperforms an approximate index at that scale
- do not add JSONB indexes on `centroid`; centroid search is served by derived pgvector state maintained by `SignalRepository.save`

Names/descriptions are generated from occurrences and refreshed on debounce, but not from the first one and not at creation — a candidate carries a deterministic placeholder until it is promoted, and generation starts there. See § Denoising: promotion.

They may use:

- clustered score feedback
- related evaluation names/descriptions when available
- related annotation or message context when that helps explain the pattern

But they must stay generic enough to represent the shared failure mode rather than the exact background details of one conversation.

This matters because discovery combines semantic pgvector similarity and full-text lexical boost:

- signal text should help scores with different wording or different surrounding details still converge on the same problem
- titles/descriptions should capture the underlying failure pattern, not memorize incidental facts from one example

## Direct Tracking

Signal-linked evaluation creation is explicit:

- signal discovery and signal creation do not automatically create evaluations
- signals may have several linked evaluations
- the managed UI exposes `Track signal` only from the signal page, and only when the signal currently has no linked evaluations
- each trigger starts the `optimize-evaluation` Temporal workflow with a deterministic `evaluations:generate:${signalId}` workflow id for initial generation (or `evaluations:optimize:${evaluationId}` for manual realignment); the server function returns `void`, and the frontend polls `getSignalAlignmentState`, which queries Temporal via `workflow.describe()` until the workflow terminates and the resulting evaluation appears via normal data-fetching
- once created, automatic throttled realignment continues as new annotations arrive: each new annotation writes `ScoreAssignedToSignal`, which the `domain-events` dispatcher routes to `signals:refresh` (throttled at 8h), which in turn publishes `evaluations:automaticRefreshAlignment` (throttled at 1h, one per active linked evaluation) to kick off `refresh-evaluation-alignment`; that workflow escalates into `optimize-evaluation` via `evaluations:automaticOptimization` (throttled at 8h) when the incremental alignment-metric drop exceeds tolerance. All windows are first-publish-wins so a continuous annotation stream cannot push the fire time forward indefinitely

Once a signal-linked evaluation exists:

- failed, non-errored monitor scores that already carried `scores.issue_id` at write time do not re-enter discovery
- failed, non-errored monitor scores that stayed unowned still flow through the centralized `signals:discovery` task, which resolves the linked signal before similarity search starts and then claims `scores.issue_id`
- errored monitor scores stay out of discovery entirely because `errored = true` makes them ineligible
- they continue to refresh signal evidence and trend state

## Product Surface

The project `Signals` page mirrors the project `Traces` page shell:

- a top action row
- a shared aggregate-counts-plus-histogram analytics panel
- an infinitely paginated signals table
- a dedicated full-page signal view at `/projects/<slug>/signals/<signalId>`, opened from row click — the legacy `?signalId=` drawer deep link (still live in already-sent emails/Slack messages) redirects there for backwards compatibility

Action-row behavior:

- left side: time range selector and columns selector
- right side: an assignee filter (multi-select over org members plus an `Unassigned` option), a `My signals` toggle whose count badge reflects the current time/search filters (but not the assignee filter itself), plus hybrid search without rerank
- the time range filters score `created_at` in ClickHouse, not signal-row timestamps in Postgres
- lifecycle stamps affect the Active/Archived tabs and notification fan-out, not the analytics panel
- the page does not expose the generic Traces filter builder or filter drawer
- signal search relies on the shared AI-layer Redis cache for embeddings; the signals domain does not add an extra embedding cache on top
- the managed Signals surface is web-only for now; there is no public `apps/api` signals contract yet

Read orchestration:

- ClickHouse owns score-backed time-range filtering, occurrence analytics, and signal trend metrics
- Postgres owns canonical signal rows, mute state, hybrid search + similarity scoring (pgvector + tsvector), and linked evaluation hydration
- signal-page reads query ClickHouse first, run `SignalRepository.hybridSearch` only when search text is present, and then hydrate canonical signals through `IN (...)` signal-id clauses

Analytics panel behavior:

- aggregate counts show `new`, `escalating`, `ongoing`, and total seen occurrences
- the histogram shows matched signal occurrences by day
- when no full range is selected, the histogram falls back to a 7-day window ending today or ending at the single selected endpoint

Signals table behavior:

- rows are **always grouped by triage priority** (Linear-style): `Urgent` → `High` → `Medium` → `Low` → `No priority`, with full-width group header rows showing each group's total count over the filtered set. The grouping is the unconditional primary sort key in `listSignalsUseCase`, so exports, bulk pagination, and prev/next signal navigation see the same order; the user-selected sort applies within each group
- the assignee filter (`assigneeIds`, with an `"unassigned"` sentinel) is honored by the table and CSV exports so exports target the visible set
- default sorting is last seen descending, then occurrences descending, with search similarity preserved as an additional tie-breaker when search text is present
- visible columns are `Signal`, `Tags`, `Status`, `Assignee`, `Trend`, `Seen at`, `Occurrences`, and `Affected traces`; `Assignee` hydrates the member's name/avatar client-side from the members collection (the list payload carries only `assigneeId`)
- `Signal` shows the signal name plus lifecycle tags, with truncation
- `Seen at` combines recency and age, for example `11d ago / 3y old`
- `Occurrences` uses the selected time range and its column header also shows the sum across all matched signals
- `Affected traces` is the occurrences count divided by the total number of traces in the selected time window, capped at `100%`
- `Evaluations` shows linked evaluation tags with truncated names plus the alignment metric percentage, or `-` when none are linked

Signal page behavior:

- the dedicated route (`/projects/<slug>/signals/<signalId>`) is the single signal surface; it replaced the former right-side drawer. The list row click navigates here, and the legacy `?signalId=` deep link redirects to it
- page-level time range and search controls do not apply on the page; signal reads use full history
- the header shows the signal name + canonical status, the resolve/ignore actions and mute toggle, the assignee + priority triage pickers, previous/next-signal navigation (buttons + `J`/`K`, cycling the default-sorted list), and a copyable slug; the description and tags sit in a full-width row below
- the header's far right, below the action row, carries the one-shot 👍/👎 feedback control (see [Feedback](#feedback-was-this-signal-worth-raising))
- the command palette gains contextual `Assign to…` (Me / Unassigned / org members) and `Set priority…` drill-down commands while the page is open, running the same `updateSignalTriage` mutation as the pickers
- triage fields are functional beyond the page: the signals list groups by priority and filters by assignee, incident notification payloads snapshot `assigneeId`/`priority` for email/Slack/in-app rendering, and changing the assignee emits `SignalAssigneeChanged` which notifies the new assignee (`issue.assigned`, in-app + email; see `dev-docs/notifications.md`)
- the report body includes the impact summary band (occurrences, affected traces/sessions/users, cost), the Patterns section, a 14-day trend histogram, the linked-evaluations section, an Examples carousel (`H`/`L` cycling), and an infinitely paginated traces table; clicking a trace opens it in an overlay sheet on top of the page
- linked evaluations show name, last alignment date, alignment metric, manual realign, and per-evaluation archive actions; the alignment badge tooltip surfaces the confusion matrix plus a "Advanced statistics" link button that opens a modal with every metric derivable from it (accuracy, recall, specificity, balanced accuracy, precision, F1, MCC)
- while a realignment is in flight, the UI shows `Aligning...`
- when a signal has no linked evaluations, the page shows `Track signal`; once at least one linked evaluation exists, the managed UI no longer shows another evaluation-generation button
- the page's body component (`SignalDetailBody`, drawer-style: header, summary, evaluations, trend, traces) is also reused inside the session-detail panel's signal slot
