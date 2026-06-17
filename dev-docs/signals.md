# Signals

Signals are the main observability entities of the reliability system.

They group similar failed, non-errored, non-draft scores into actionable failure patterns.

> **Renamed from "Issues" (Signals spec, Phase 1).** The rename is behavior-preserving, but three identifiers are intentionally **kept** because they are persisted or in-flight: the `issue.*` alert-incident kinds (`alert_incidents.kind`, retired in a later phase, not renamed), the ClickHouse `scores.issue_id` column (kept alongside the new `signal_id` until a later cleanup), and the domain **event names** (`IssueCreated`, `ScoreAssignedToIssue`, …) — these are renamed to `Signal*` in TypeScript, with the persisted `outbox_events.event_name` migrated and a temporary `EVENT_NAME_ALIASES` shim at the `domain-events` dispatcher bridging any in-flight rows. The Postgres `issues` table → `signals` is an in-place rename (brief rollover downtime accepted). See `specs/signals.md` for the full plan.

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

## Lifecycle

Signals can be:

```typescript
export const SignalState = {
  New: "new",
  Escalating: "escalating",
  Resolved: "resolved",
  Regressed: "regressed",
  Ignored: "ignored",
} as const;

export type SignalState = (typeof SignalState)[keyof typeof SignalState];
```

- `new`: first discovered less than 7 days ago
- `escalating`: occurrences in the last day are 33% greater than the average in the previous 7-day baseline
- `resolved`: no occurrences in the last 14 days, or manually resolved
- `regressed`: new occurrences appeared after the signal was resolved
- `ignored`: manually ignored by the user

An signal can be in multiple states at the same time, for example `new` and `escalating`.

Conceptually:

- `Active` means not ignored and not resolved
- `Archived` means ignored or resolved without regression

Lifecycle side effects:

- ignoring an signal archives its linked evaluations immediately
- manual resolve opens a confirmation modal with a keep-monitoring toggle
- that toggle defaults from `keepMonitoring`, after project settings fall back to organization settings when project-level `keepMonitoring` is unset, and can be overridden for the specific resolve action
- the confirmed toggle state decides whether linked evaluations stay active or archive
- resolving or ignoring an signal closes any open `issue.escalating` incident immediately (emits `SignalEscalationEnded` with reason `resolved`/`ignored`). Ignored and resolved signals no longer drive lifecycle/alerting transitions, so the stale escalation is cleared. This close is silent — unlike an organic de-escalation it does not send a recovery notification

The `escalating` state is backed by an open `issue.escalating` row in `alert_incidents`, not recomputed from the occurrence aggregate. A seasonal detector opens/closes that row; closes fire on the absolute-rate backstop, a band-shape + dwell recovery, or a 72h hard timeout. Signals with no seasonal history (e.g. a normally-silent signal hit by a one-off burst) use the same band-shape + dwell exit on the close side, so they de-escalate shortly after going quiet rather than waiting on the 72h ceiling.

Important state timestamps:

- `clusteredAt`: last centroid/cluster refresh
- `escalatedAt`: latest escalation transition timestamp
- `resolvedAt`: manual or automatic resolution timestamp
- `ignoredAt`: manual ignore timestamp

## Signal Source

The `source` field records the provenance of the **first score** that created the issue. It is immutable for the lifetime of the issue.

```typescript
type SignalSource = "annotation" | "custom";
```

- `"annotation"` — the signal was born from a human annotation (UI, API), a published queue annotation, or a flagger-authored annotation. The creating score carries `source: "annotation"` with `sourceId` equal to `"UI"`, `"API"`, `"SYSTEM"`, or a queue CUID.
- `"custom"` — the signal was born from a custom score pushed through the API. The creating score carries `source: "custom"`.

> **Note**: `"evaluation"` is intentionally excluded. Evaluation scores are always linked to an existing signal at creation time; they never spawn a brand-new issue.

The derivation rule applied at signal creation time:

```typescript
const deriveSignalSource = (score: Score): SignalSource => {
  if (score.source === "annotation") {
    return "annotation";
  }
  return "custom";
};
```

Signal creation eligibility:

- annotations are the primary signal
- annotation flows can also link to an existing signal explicitly; that human choice is carried as selected signal intent once the draft is published and then resolved by the centralized `signals:discovery` task
- failed scores from evaluations that are not already linked to an signal may also create new signals
- failed custom scores may also create new signals

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
16. refresh signal name/description asynchronously on debounce only for the existing-signal path that requested `ScoreAssignedToSignal`, reusing the shared signal-details generation use case against the last `25` assigned occurrences plus the previous persisted details as the stabilization baseline

Execution rules:

- `signals:discovery` runs first after an eligible non-draft failed non-errored score write commits
- scores already written with `issue_id`, including direct-owned live signal-linked monitor failures, short-circuit before retrieval/rerank; retries through `signals:discovery` may still replay analytics sync idempotently
- `signal-discovery` runs only when that centralized gate still needs retrieval/rerank work
- when initial workflow retrieval resolves to no known signal, the workflow must call the bounded locked serialization activity instead of creating an signal directly
- `signals:refresh` runs after the configured throttle window elapses for an existing signal
- both the workflow and the debounced task must re-check current ownership/lifecycle state before doing expensive work
- in workflow orchestration, do feedback embedding first and then enter locked serialization; annotation scores may carry both enriched and raw feedback embeddings, and the search/rerank/create-or-assign decision runs under the Redis serialization gates
- the brand-new signal path must generate its first name/description before the signal row is first persisted, and that synchronous generation step must reuse the same shared signal-details generation use case that later debounced refreshes call
- the debounced `signals:refresh` path must re-lock and re-read the canonical signal row before saving generated details so it cannot overwrite a newer centroid or lifecycle update
- after `signals:refresh` persists changed details, no explicit search sync is required because Postgres derives `search_document` from canonical signal text
- rerank results already carry canonical signal ids from Postgres search, so there is no projection UUID resolution step
- the no-match path is only provisional; before creating a new signal, serialization must first acquire a feedback-scoped Redis lock and re-run hybrid search and rerank, trying enriched feedback first and raw annotation feedback second when raw feedback is available
- if the feedback-scoped re-check still finds no signal, serialization must acquire the project-scoped Redis lock and re-run the enriched-then-raw retrieval sequence again before creating
- each Redis lock acquisition must be non-blocking; if the lock is already held, serialization returns a lock-unavailable result so the workflow sleeps durably and retries at that point instead of holding a database connection while waiting
- both the create-from-score step and the assign-to-signal step must use a conditional `scores.issue_id` claim so only one concurrent owner wins while the canonical signal row and centroid stay transactionally consistent
- the assign-to-signal path must lock the canonical signal row before recomputing and saving the centroid so parallel score assignments into the same signal do not lose centroid contributions
- resolved and ignored signals are still valid discovery match candidates; this preserves regression detection and keeps future matching scores linked to intentionally ignored signals

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

## Denoising

The base v2 denoising strategy should remain conservative and aligned with the proposal:

- low-evidence signals with no linked annotations can be hidden from the main UI
- signals with at least one linked annotation are always visible
- manually created signals and manually linked annotation signals are always visible
- do not bring back the v1 merge/merged-state system

The exact low-evidence visibility threshold should remain configurable.

The system may also support a stronger buffered/provisional workflow on top of the same signal entity. The exact promotion rules are still pending precise definition, but the intended shape is:

- persist newly created signal candidates immediately
- keep provisional signals hidden until they pass promotion rules
- promote them when enough evidence accumulates, when annotation evidence lands, or when a user explicitly promotes them
- let the stronger provisional workflow absorb duplicate or noisy concurrent no-match signal candidates before they become visible in the main Signals UI
- keep the core signal entity shape unchanged

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
- btree on `(organization_id, project_id, ignored_at, resolved_at, created_at)` for project-scoped lifecycle filtering and management actions
- GIN index on `search_document` for lexical boost in hybrid search
- no IVFFlat/HNSW index on `centroid_embedding`: signals per project are expected in the hundreds to low thousands, and an exact project-scoped sequential scan outperforms an approximate index at that scale
- do not add JSONB indexes on `centroid`; centroid search is served by derived pgvector state maintained by `SignalRepository.save`

Names/descriptions are generated from occurrences and refreshed on debounce.

They may use:

- clustered score feedback
- related evaluation names/descriptions when available
- related annotation or message context when that helps explain the pattern

But they must stay generic enough to represent the shared failure mode rather than the exact background details of one conversation.

This matters because discovery combines semantic pgvector similarity and full-text lexical boost:

- signal text should help scores with different wording or different surrounding details still converge on the same problem
- titles/descriptions should capture the underlying failure pattern, not memorize incidental facts from one example

## Direct Monitoring

Signal-linked evaluation creation is explicit:

- signal discovery and signal creation do not automatically create evaluations
- signals may have several linked evaluations
- the managed UI exposes `Monitor signal` only from the signal page, and only when the signal currently has no linked evaluations
- each trigger starts the `optimize-evaluation` Temporal workflow with a deterministic `evaluations:generate:${signalId}` workflow id for initial generation (or `evaluations:optimize:${evaluationId}` for manual realignment); the server function returns `void`, and the frontend polls `getSignalAlignmentState`, which queries Temporal via `workflow.describe()` until the workflow terminates and the resulting evaluation appears via normal data-fetching
- once created, automatic throttled realignment continues as new annotations arrive: each new annotation writes `ScoreAssignedToSignal`, which the `domain-events` dispatcher routes to `signals:refresh` (throttled at 8h), which in turn publishes `evaluations:automaticRefreshAlignment` (throttled at 1h, one per active linked evaluation) to kick off `refresh-evaluation-alignment`; that workflow escalates into `optimize-evaluation` via `evaluations:automaticOptimization` (throttled at 8h) when the incremental alignment-metric drop exceeds tolerance. All windows are first-publish-wins so a continuous annotation stream cannot push the fire time forward indefinitely

Once an signal-linked evaluation exists:

- failed, non-errored monitor scores that already carried `scores.issue_id` at write time do not re-enter discovery
- failed, non-errored monitor scores that stayed unowned still flow through the centralized `signals:discovery` task, which resolves the linked signal before similarity search starts and then claims `scores.issue_id`
- errored monitor scores stay out of discovery entirely because `errored = true` makes them ineligible
- they can move a resolved signal into `regressed`

## Product Surface

The project `Signals` page mirrors the project `Traces` page shell:

- a top action row
- a shared aggregate-counts-plus-histogram analytics panel
- an infinitely paginated signals table
- a dedicated full-page signal view at `/projects/<slug>/signals/<signalId>`, opened from row click — the legacy `?signalId=` drawer deep link (still live in already-sent emails/Slack messages) redirects there for backwards compatibility

Action-row behavior:

- left side: time range selector and columns selector
- right side: an assignee filter (multi-select over org members plus an `Unassigned` option), a `My signals` toggle whose count badge reflects the current tab/time/search filters (but not the assignee filter itself), `Active` / `Archived` tabs, plus hybrid search without rerank
- the time range filters score `created_at` in ClickHouse, not signal-row timestamps in Postgres
- the lifecycle tabs affect the signals table only, not the analytics panel
- the page does not expose the generic Traces filter builder or filter drawer
- signal search relies on the shared AI-layer Redis cache for embeddings; the signals domain does not add an extra embedding cache on top
- the managed Signals surface is web-only for now; there is no public `apps/api` signals contract yet

Read orchestration:

- ClickHouse owns score-backed time-range filtering, occurrence analytics, and signal trend metrics
- Postgres owns canonical signal rows, lifecycle grouping, hybrid search + similarity scoring (pgvector + tsvector), and linked evaluation hydration
- signal-page reads query ClickHouse first, run `SignalRepository.hybridSearch` only when search text is present, and then hydrate canonical signals through `IN (...)` signal-id clauses

Analytics panel behavior:

- aggregate counts show `new`, `escalating`, `regressed`, `resolved`, and total seen occurrences
- the histogram shows matched signal occurrences by day
- when no full range is selected, the histogram falls back to a 7-day window ending today or ending at the single selected endpoint

Signals table behavior:

- rows are **always grouped by triage priority** (Linear-style): `Urgent` → `High` → `Medium` → `Low` → `No priority`, with full-width group header rows showing each group's total count over the filtered set. The grouping is the unconditional primary sort key in `listSignalsUseCase`, so exports, bulk pagination, and prev/next signal navigation see the same order; the user-selected sort applies within each group
- the assignee filter (`assigneeIds`, with an `"unassigned"` sentinel) is honored by the table, bulk lifecycle actions, and CSV exports so select-all always targets the visible set
- no bulk-selection UI is shown in this revision, even though backend bulk lifecycle actions may still exist for API parity
- default sorting is last seen descending, then occurrences descending, with search similarity preserved as an additional tie-breaker when search text is present
- visible columns are `Signal`, `Tags`, `Status`, `Assignee`, `Trend`, `Seen at`, `Occurrences`, and `Affected traces`; `Assignee` hydrates the member's name/avatar client-side from the members collection (the list payload carries only `assigneeId`)
- `Signal` shows the signal name plus lifecycle tags, with truncation
- `Seen at` combines recency and age, for example `11d ago / 3y old`
- `Occurrences` uses the selected time range and its column header also shows the sum across all matched signals
- `Affected traces` is the occurrences count divided by the total number of traces in the selected time window, capped at `100%`
- `Evaluations` shows linked evaluation tags with truncated names plus the alignment metric percentage, or `-` when none are linked

Signal page behavior:

- the dedicated route (`/projects/<slug>/signals/<signalId>`) is the single signal surface; it replaced the former right-side drawer. The list row click navigates here, and the legacy `?signalId=` deep link redirects to it
- page-level time range, lifecycle-tab, and search controls do not apply on the page; signal reads use full history
- the header shows the signal name + canonical lifecycle status, the resolve/ignore lifecycle actions, the assignee + priority triage pickers, previous/next-signal navigation (buttons + `J`/`K`, cycling the default-sorted list of the signal's own lifecycle group), and a copyable slug; the description and tags sit in a full-width row below
- the command palette gains contextual `Assign to…` (Me / Unassigned / org members) and `Set priority…` drill-down commands while the page is open, running the same `updateSignalTriage` mutation as the pickers
- triage fields are functional beyond the page: the signals list groups by priority and filters by assignee, incident notification payloads snapshot `assigneeId`/`priority` for email/Slack/in-app rendering, and changing the assignee emits `SignalAssigneeChanged` which notifies the new assignee (`issue.assigned`, in-app + email; see `dev-docs/notifications.md`)
- the report body includes the impact summary band (occurrences, affected traces/sessions/users, cost), the Patterns section, a 14-day trend histogram, the linked-evaluations section, an Examples carousel (`H`/`L` cycling), and an infinitely paginated traces table; clicking a trace opens it in an overlay sheet on top of the page
- linked evaluations show name, last alignment date, alignment metric, manual realign, and per-evaluation archive actions; the alignment badge tooltip surfaces the confusion matrix plus a "Advanced statistics" link button that opens a modal with every metric derivable from it (accuracy, recall, specificity, balanced accuracy, precision, F1, MCC)
- while a realignment is in flight, the UI shows `Aligning...`
- when an signal has no linked evaluations, the page shows `Monitor signal`; once at least one linked evaluation exists, the managed UI no longer shows another monitor-generation button
- the page's body component (`SignalDetailBody`, drawer-style: header, summary, evaluations, trend, traces) is also reused inside the session-detail panel's signal slot
