# Signal feedback — was this signal a real problem?

> **Documentation** — durable homes after stabilization: `dev-docs/signals.md` (feedback latch + detail-page surface), `dev-docs/flaggers.md` (the flagger-trace pointer and the human-verdict loop over classifications), `dev-docs/scores.md` (`metadata.flaggerTraceId`), `dev-docs/ai-generation-features.md` (the dogfood write-back). Related current docs: `dev-docs/mcp.md`, `dev-docs/api.md`.
>
> **Depends on** — flagger classification telemetry into the `latitude-flaggers` dogfood project, and the dogfood review pattern established by `@domain/product-feedback` (`recordEnrichmentReview`, `recordSystemAnnotatorReview`). It reuses that package as the domain home but **not** its HTTP client: every hop here is an in-process use-case (see [D9](#decisions)).

## Contents

1. [Purpose](#purpose)
2. [Ground truth — what exists today](#ground-truth--what-exists-today)
3. [The model: one verdict, two destinations](#the-model-one-verdict-two-destinations)
4. [UX](#ux)
5. [Storage](#storage)
6. [Domain behavior](#domain-behavior)
7. [Fan-out to the flagger's own traces](#fan-out-to-the-flaggers-own-traces)
8. [Public API, MCP, SDK, CLI](#public-api-mcp-sdk-cli)
9. [Web wiring](#web-wiring)
10. [Decisions](#decisions)
11. [Out of scope](#out-of-scope)
12. [Open questions](#open-questions)
13. [Testing plan](#testing-plan)
14. [Tasks](#tasks)

---

## Purpose

Nothing in the product asks the customer whether a signal was worth raising. Flagger precision is currently inferred from proxies — resolve/ignore rates, the reviewer LLM's own rejections, the screening summary log — none of which distinguish "I fixed it" from "this was never a problem".

This feature adds the direct question to the signal detail page: a thumbs up / thumbs down plus a short reason, given once per signal. The verdict is stamped on the signal, and it is fanned out as human annotations onto **Latitude's own flagger classification traces** in the `latitude-flaggers` dogfood project, which turns customer judgment into a labelled precision dataset over the exact generations that produced the detections. A thumbs-down doubles as the fastest path to a clean list: `Save and ignore` records the verdict and archives the signal in one gesture.

One line: **signal feedback is a one-shot human verdict that grades our flagging system on the customer's own data.**

## Ground truth — what exists today

Verified in code. The feature is mostly composition; the only new machinery is the signal-row latch and one fan-out task.

| Piece | Where | Reused as |
| --- | --- | --- |
| Signal detail header (`title` / `description` / `actions` slots) | `apps/web/src/layouts/ListingLayout/index.tsx`, `.../signals/$signalSlug/index.tsx` | Placement, via a new `titleAside` slot |
| Thumbs-up/down + comment popover, comment required on the negative branch | `.../-components/annotations/enrichment-popover.tsx`, `@repo/ui` `ThumbButton` | The control's shape and copy conventions |
| One-way conditional claim on the signal row | `SignalRepository.claimReopenOnOccurrence` | Pattern for `claimFeedback` |
| Lifecycle commands (`ignore`, batch, idempotent) | `applySignalLifecycleCommandUseCase` (`@domain/signals`) | The `Save and ignore` half |
| Transactional outbox → `domain-events` dispatcher → topic task | `OutboxEventWriter`, `apps/workers/src/workers/domain-events.ts` | Durable fan-out after the latch commits |
| Newest-first occurrence reader with a source filter and draft exclusion | `ScoreRepository.listBySignalId` (orders `created_at DESC, id DESC`) | "Last 25 occurrences" |
| Flagger-authored occurrence shape: `sourceType: "annotation"`, `sourceId: "SYSTEM"`, `metadata.flaggerSlug`, `traceId` = session's latest output trace | `upsertFlaggerAnnotationScore` (`@domain/flaggers`) | How a flagger occurrence is recognised |
| Dogfood review flows (customer grades a Latitude generation → annotation in the matching `latitude-*` project) | `@domain/product-feedback` (`recordEnrichmentReview`, `recordSystemAnnotatorReview`) | The domain home for the new flow; its `ProductFeedbackClient` port is **not** used ([D9](#decisions)) |
| Published annotation write against a resolved trace id | `writePublishedAnnotationUseCase` (`@domain/annotations`) — what the public annotations endpoint itself calls | The write, run in-process |
| Scoped trace existence check (one count query) | `TraceRepository.matchesFiltersByTraceId` — what `resolveTraceIdFromRef` uses for `trace.by = "id"` | Proving the stored trace id really is in the dogfood project |
| Cross-organization API-key lookup returning the key's `organizationId` (documented RLS bypass) | `ApiKeyRepository.findByTokenHash` | Resolving which organization we dogfood into |
| Explicit per-call organization scoping, including a second scope inside one worker handler | `withPostgres(layers, client, organizationId)` / `withClickHouse(...)`; `sweepEscalating` in the signals worker | Writing into the dogfood organization from the customer's job |
| Flagger generations captured into `latitude-flaggers` (`capture` with `project` + `metadata`) | `run-flagger.ts`, `run-flagger-annotator.ts`, `runWithAiTelemetry` | The annotation target; its trace id becomes the pointer |
| Optional observability metadata on a generate result (`servedBy`, `tokenUsage`) | `GenerateResult` (`@domain/ai`) | Shape precedent for `telemetryTraceId` |

Three facts from that table shape everything below:

- **The dogfood organization lives in the same deployment.** `infra/lib/ecs.ts` sets `LAT_LATITUDE_API_URL` and `LAT_LATITUDE_TELEMETRY_INGEST_URL` to the deployment's *own* API and ingest hosts, so staging dogfoods into staging and production into production. The flagger's classification traces sit in the same Postgres and ClickHouse as the customer's signal, separated only by organization scope. Every write this feature needs is therefore reachable in-process, and the shipped `@platform/latitude-api` HTTP call is a loopback to our own API ([D9](#decisions)).
- **`capture()` starts a new root trace** unless an outer Latitude capture context is already active (`shouldReuseActiveLatitudeTrace`, `packages/telemetry/typescript/src/sdk/context.ts`). The flagger's instruction-extraction, classification, and annotation-review generations each call `capture` on their own, so one classification run lands as **two or three separate traces** in `latitude-flaggers`.
- **A flagger score does not record which of those traces produced it.** `upsertFlaggerAnnotationScore` writes `traceId` = the *customer's* flagged trace (the session's latest output trace) and `metadata: { rawFeedback, flaggerSlug, messageIndex?, contentHash? }`. Nothing points at the flagger's own generation. So the score gains that pointer ([D10](#decisions)) rather than the reader guessing it back from telemetry metadata.

## The model: one verdict, two destinations

```
user clicks 👍 / 👎 on the signal page
  └─ submitSignalFeedbackUseCase
       ├─ conditional claim on `signals` (WHERE feedback IS NULL)      ← the latch, immutable
       ├─ outbox: SignalFeedbackSubmitted                              ← same transaction
       └─ (optional) applySignalLifecycleCommandUseCase("ignore")      ← the 👎 shortcut
             ↓  after commit
       domain-events dispatcher → issues:reviewFlaggerOccurrences
             ↓
       reviewSignalFlaggerOccurrencesUseCase (signals worker)
         last 25 occurrences → flagger rows → metadata.flaggerTraceId → dedupe
             ↓  one job per flagger trace
       issues:reviewFlaggerOccurrence
             ↓
       recordSignalFlaggerReviewUseCase          ← in-process, no HTTP, no SDK
         resolve dogfood org (from the telemetry API key) + `latitude-flaggers` project
         writePublishedAnnotationUseCase on that trace id
           value / passed / feedback forwarded unchanged from the signal's record
```

The signal's feedback **is** a score in everything but its storage location: the same `value` / `passed` / `feedback` triple, about the flagging decision rather than about a trace. 👍 is `passed: true`, `value: 1`; 👎 is `passed: false`, `value: 0`; the reason is `feedback`. That is why the fan-out forwards the triple verbatim instead of translating a verdict enum into a polarity ([D8](#decisions)).

The customer's own project is **never written to**. That is a deliberate consequence of routing to the dogfood project, and it buys three things: a confirmed thumbs-up cannot spawn a duplicate signal through discovery (a failed, unowned, non-draft annotation is exactly the discovery trigger — see `checkEligibilityUseCase`), occurrence counts and trend histograms cannot move on a day when nothing happened, and evaluation-alignment example selection (`EvaluationAlignmentExamplesRepositoryLive`, which groups scores by trace) cannot be reshaped by a label. No new eligibility gate, no analytics exception, no alignment rework.

On the dogfood side the polarity is unambiguous, because the scored artifact is our own generation: 👍 means the classification was right (`passed: true, value: 1`), 👎 means it was a false positive (`passed: false, value: 0`). Same convention as `recordSystemAnnotatorReviewUseCase`. The 👎 rows are failed annotations in `latitude-flaggers`, so they flow into signal discovery **for that project** and cluster into signals of the form "the `frustration` flagger keeps mis-firing on X" — which is the intended feedback loop, not a side effect.

## UX

### Placement

`ListingLayout.Header` gains an optional `titleAside` slot: the right-hand column becomes a vertical stack (`items-end`) with `actions` on top and `titleAside` below it, vertically centered against the title/description block and flush with the header's right edge. Every existing caller passes no `titleAside` and renders byte-identically.

The signal detail page (`.../signals/$signalSlug/index.tsx`) passes the new `SignalFeedback` component there, so the control sits on the signal name / slug row, far right, under the `Send to` · triage · resolve/ignore action row.

The control renders for **every** signal. A signal with no flagger occurrences simply produces no dogfood annotations; the verdict on the row still stands.

### States

**1. Not yet given.** Two `ThumbButton`s (`variant="up"` / `"down"`, unselected). Tooltips: "This signal is a real problem" and "This is a false positive". Disabled while the signal is loading or missing.

**2. Popover open.** Clicking a thumb selects it and opens a `Popover` anchored to it (`side="bottom" align="end"`, ~24rem), containing:

- a muted line: "Your feedback helps us improve how we detect signals."
- a `Textarea` (`minRows={3}`, autofocus). Placeholder 👍 "Optional: what made this signal useful?" / 👎 "What made this a false positive?"
- footer buttons:
  - 👍 → `Save` (primary).
  - 👎 → `Save and ignore` (primary) + `Save` (outline), in that order, so the destructive-but-common path is the default one.
- `Save` / `Save and ignore` are disabled on 👎 until the reason has non-whitespace content ([D2](#decisions)); on 👍 they are always enabled. `Cmd/Ctrl+Enter` submits when valid.
- Clicking the other thumb switches the verdict and clears the reason (same as the enrichment popover).
- Dismissing the popover without saving records nothing.

**3. Saved.** The popover closes, the control collapses to the chosen thumb alone — filled, disabled — and a toast fires: "Thank you for helping us make Latitude better." The `Save and ignore` variant reads "Thank you for helping us make Latitude better. Signal ignored." and the page's lifecycle badges flip through `invalidateSignalQueries`. Failures raise a destructive toast via `toUserMessage`; if the ignore half fails after the verdict landed, the copy says so explicitly ("Feedback saved, but the signal could not be ignored").

**4. Already given (any viewer, any session).** Exactly one filled, disabled thumb — 👍 when `feedback.passed`, 👎 otherwise — with a tooltip carrying the stored reason, or "Marked as a real problem" / "Marked as a false positive" when it is empty. No author and no date, because the row does not store them ([Storage](#storage)). No edit affordance, no undo — the latch is the product rule.

## Storage

**One** nullable JSONB column on `latitude.signals` (`packages/platform/db-postgres/src/schema/signals.ts`), holding the core of a Latitude score:

```ts
feedback: jsonb("feedback").$type<SignalFeedback>(), // nullable; the customer's one-shot verdict on this signal. Non-null is a one-way latch: feedback is never edited or cleared.
```

```ts
// packages/domain/signals/src/entities/signal.ts, beside signalCentroidSchema
export const signalFeedbackSchema = z.object({
  value: scoreValueSchema, // normalized [0, 1]; 1 for 👍, 0 for 👎
  passed: z.boolean(), // whether the signal is a real problem worth flagging
  feedback: z.string(), // the customer's reason; empty when a 👍 was saved bare
})
export type SignalFeedback = z.infer<typeof signalFeedbackSchema>
```

`Signal` gains `feedback: signalFeedbackSchema.nullable()`, so `SignalWithLifecycle` → `SignalDetails.issue` → web record → API response all carry it with no extra plumbing, and the same object is what every boundary serializes.

`null` is the whole state machine: no feedback yet. Nothing records **when** feedback was given or **who** gave it — neither is used by any consumer here (the latch only needs "is it null", fan-out idempotency keys on the signal id, and the dogfood write carries no attribution because `ProductFeedbackAnnotationInput` has no metadata bag). The visible cost is in [UX state 4](#states): the tooltip can show the reason but not "by Alex on 17 Aug".

No index: every read is by primary key or on an already-hydrated row, and no query filters on `feedback`. No backfill — existing signals read as "no feedback given". One generated `ALTER TABLE … ADD COLUMN feedback jsonb` (`pnpm --filter @platform/db-postgres pg:generate`), never a hand-written SQL file. Nothing indexes into the JSONB, so the `centroid` rule applies unchanged: no JSONB indexes on this column.

New constants in `packages/domain/signals/src/constants.ts`:

```ts
export const SIGNAL_FEEDBACK_MAX_LENGTH = 2_000
export const SIGNAL_FEEDBACK_OCCURRENCE_SAMPLE_LIMIT = 25
```

`SIGNAL_FEEDBACK_MAX_LENGTH` is a boundary guard (public API body + web input validator) so a pasted transcript cannot land in the row; the stored schema itself keeps `feedback` as a plain `z.string()`, matching `Score`.

## Domain behavior

`SignalRepository.claimFeedback({ signalId, feedback, now }): Effect<boolean>` — one conditional `UPDATE … SET feedback = ?, updated_at = ? WHERE id = ? AND feedback IS NULL`, returning whether **this** call performed the write. Modelled on `claimReopenOnOccurrence`, and for the same reason: two concurrent submissions (two tabs, a UI click racing an MCP call) must resolve to exactly one recorded verdict without a read-modify-write window.

`submitSignalFeedbackUseCase({ organizationId, projectId, signalId, passed, value, feedback, ignore })` in `@domain/signals`:

1. `SignalRepository.findById` — the repository's default-deny visibility filter already excludes soft-deleted and unpromoted signals, so an unreachable signal cannot be graded. Cross-project ids fail the project check.
2. Reject a `passed: false` submission whose trimmed `feedback` is empty (`SignalFeedbackReasonRequiredError`, 422). Trim once here, at the domain boundary, so no whitespace-only reason is ever persisted or forwarded (same rule the product-feedback use-cases already apply).
3. Build the record: `{ value: value ?? (passed ? 1 : 0), passed, feedback: trimmed }`.
4. In one transaction: `claimFeedback` → on `false` fail with `SignalFeedbackAlreadySubmittedError` (409); on `true` write `SignalFeedbackSubmitted` to the outbox.
5. After commit, when `ignore` is true, run `applySignalLifecycleCommandUseCase({ command: "ignore" })` for the signal. It is idempotent and already handles the mute, the evaluation archive, and closing an open escalation.
6. Return `{ feedback: <the record>, ignored }`.

The verdict is claimed before the ignore runs, so a lifecycle failure surfaces as an error while the recorded verdict stands. That ordering is deliberate: the feedback is the durable artifact worth protecting, and ignoring is a one-click retry from the header.

Both errors live in `packages/domain/signals/src/errors.ts` with `httpStatus` / `httpMessage`, per that package's reference-implementation role for domain errors.

New event in `packages/domain/events/src/event-payloads.ts` — flattened rather than nesting a `feedback.feedback`, since the payload is a message and not the row:

```ts
SignalFeedbackSubmitted: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly value: number
  readonly passed: boolean
  readonly feedback: string
}
```

No timestamp on the payload: the one-shot latch makes the signal id the idempotency anchor, so there is nothing for a `submittedAt` to discriminate.

## Fan-out to the flagger's own traces

**The prerequisite: a flagger score records the generation that produced it.** Four additive steps, and the reason the feedback path never has to search for a trace ([D10](#decisions)):

1. **`GenerateResult` gains `telemetryTraceId?: string`** (`@domain/ai`), populated by the Vercel adapter when the call was captured. `runWithAiTelemetry` (`@platform/ai-latitude`) reads `trace.getActiveSpan()?.spanContext().traceId` *inside* the `capture` callback, where the active span is the capture root — both of `captureWrapper`'s branches (new root, or reuse of an active Latitude trace) yield the trace the generation is exported into. It has to be read there: once the effect returns, the capture span has ended and the active span is the worker's own Datadog trace, not the Latitude one. The field mirrors `servedBy` — optional observability metadata on an existing result.

   **It must not be added to the AI cache's `generateResultFromJsonStringSchema`.** A cache hit never creates a span, so a persisted trace id would point at whichever session first produced that generation and the verdict would land on an unrelated flagger trace. Leaving it out means a cache hit yields no trace id, which is the truth: there is no trace for a call that did not happen. This is the one place in the change that looks like an omission and is not, so it carries a comment.

2. **`RunFlaggerResult` and `ClassifySessionFlaggerResult` carry `flaggerTraceId`** from the classify call, alongside the `feedback` / `messageIndex` they already thread.
3. **The classification workflow passes it to `saveSessionFlaggerAnnotation`**, exactly as it already passes `contentHash` and `latestTraceId`.
4. **`upsertFlaggerAnnotationScore` writes `metadata.flaggerTraceId`**, and `annotationScoreMetadataSchema` (`@domain/scores`) gains the optional field beside `flaggerSlug`, with the same "flagger rows only" framing.

**Dispatcher.** `apps/workers/src/workers/domain-events.ts` maps `SignalFeedbackSubmitted` to one publish: `issues:reviewFlaggerOccurrences { organizationId, projectId, signalId }`, `dedupeKey: issues:feedback-review:${signalId}`. The latch makes the signal id a sound idempotency key — a signal is graded at most once, ever.

**Selection** (`reviewSignalFlaggerOccurrencesUseCase`, `@domain/signals`, run by the existing signals worker on the `issues` topic, which already has `ScoreRepository` + `SignalRepository` + the publisher):

1. Load the signal; skip when `feedback` is null (a redelivery ahead of the commit cannot happen, but the guard keeps the task honest as a standalone entry point). The signal's own record is the source of truth for the triple, so a stale event payload can never write a different verdict than the row holds.
2. `listBySignalId({ projectId, signalId, source: "annotation", options: { limit: SIGNAL_FEEDBACK_OCCURRENCE_SAMPLE_LIMIT, draftMode: "exclude" } })` — newest-first, drafts out.
3. Keep rows that are flagger-authored and carry a flagger trace: `sourceId === "SYSTEM"`, `metadata.flaggerSlug` present, `metadata.flaggerTraceId` present. Every slug counts, not only the one that created the signal ([D3](#decisions)).
4. Dedupe by `metadata.flaggerTraceId` — one verdict per classification, however many occurrence rows point at it.
5. Publish one `issues:reviewFlaggerOccurrence { organizationId, projectId, signalId, flaggerTraceId, flaggerSlug, value, passed, feedback }` per target, `dedupeKey: issues:feedback-review:${signalId}:${flaggerTraceId}`. One job per target rather than one fat job, so one bad target cannot re-drive 24 successful writes on retry.
6. Log one summary line: occurrences scanned, flagger rows kept, rows without a flagger trace, targets published. Same self-observability style as the flagger screening pass.

**The write is in-process, not over the SDK** ([D9](#decisions)). `recordSignalFlaggerReviewUseCase` (`@domain/product-feedback`, run by the signals worker, which already holds the Postgres and ClickHouse clients):

1. **Resolve the dogfood organization** from the telemetry credential: hash `LAT_LATITUDE_TELEMETRY_API_KEY` with the existing helper and read `ApiKeyRepository.findByTokenHash` (already a documented cross-org lookup that bypasses RLS and returns the key's `organizationId`). Memoize per process. No key, or an unknown key → skip the whole flow, which is exactly how the dogfood path degrades today.
2. **Resolve the project** with `ProjectRepository.findBySlug(LATITUDE_TELEMETRY_PROJECT_SLUGS.flaggers)` under a Postgres scope pinned to that organization. The organization comes first, always — resolving `latitude-flaggers` by slug across organizations could match a customer project of the same name and write into it.
3. **Check the trace belongs to that project** with `TraceRepository.matchesFiltersByTraceId({ organizationId: dogfoodOrgId, projectId, traceId: flaggerTraceId })` — one count query, the same scoped existence check `resolveTraceIdFromRef` performs for `trace.by = "id"`. No match → log and skip. There is nothing to search for and nothing to disambiguate: the score already names the exact trace ([D10](#decisions)).
4. **Write the annotation** with `writePublishedAnnotationUseCase({ organizationId: dogfoodOrgId, projectId, sourceId: "API", traceId: flaggerTraceId, value, passed, feedback, annotatorId: null, sessionId: null, spanId: null })` under Postgres + ClickHouse scopes pinned to the dogfood organization. Skip when the trace already carries a published `"API"`-sourced annotation with the same `(passed, feedback)` — one indexed `listByTraceId` read makes a mid-job retry idempotent, which the loopback could not do at all.

   `sourceId: "API"` keeps the new rows identical in shape to the dogfood review annotations the shipped flows already write, and it is deliberately **not** `"SYSTEM"`: that sentinel marks flagger-authored rows and is load-bearing for flagger anchor dedup, which also runs inside `latitude-flaggers` (the project is itself flagged — see reflag in `dev-docs/flaggers.md`). `annotatorId` stays `null` because the human belongs to a different tenant, and a cross-tenant user id on a dogfood score row would be a dangling reference.

   The triple passes straight through — no polarity translation, because a signal's feedback and the annotation it becomes grade the same thing. The one substitution is a canned `CONFIRMED_FEEDBACK` text for a bare 👍, matching `APPROVED_FEEDBACK` / `GOOD_FEEDBACK` in the sibling flows.

`ScoreCreated` fires in the dogfood organization exactly as it does today, so 👎 rows keep clustering into signals inside `latitude-flaggers`. The write's observable result is unchanged; only the transport is.

**Crossing the organization boundary** is the one architectural liberty this feature takes, so the rules are explicit: the dogfood organization id may only come from the telemetry credential (never from a request, a payload, or a slug lookup), only the annotation write may run under that scope, and it happens only in the worker — never in a web or API request path. Mechanically it is an ordinary `withPostgres(layers, client, organizationId)` / `withClickHouse(...)` scope with a different id, not an RLS bypass; the signals worker already composes a second, wider scope for `sweepEscalating`.

**Degradation is silent and bounded:**

- Occurrences flagged before this ships have no `metadata.flaggerTraceId` → skipped by selection. Feedback on an old signal records the verdict on the row and may write no dogfood annotations at all. Accepted; there is no backfill (the pointer was never captured).
- **Deterministic detections never have one.** `tool-call-errors`, `output-schema-validation`, `empty-response`, `low-cache-hit-rate` and `trashing`'s deterministic path write their score straight from screening with no LLM call, so there is no generation to grade. Their precision is a code question, not a model question.
- An AI-cache hit yields no trace id (see above), so that occurrence is skipped rather than mislabelled.
- No `LAT_LATITUDE_TELEMETRY_API_KEY` (self-hosted, local dev, CI) → no dogfood organization → the flow skips. Same net behavior as today's no-op client, minus the HTTP client.
- A missing `latitude-flaggers` project, or a stored trace id that is not in it → logged and skipped, not retried. That check doubles as the tenancy guard: a stored pointer can only ever be honoured inside the dogfood project.
- Repository and ClickHouse failures propagate so BullMQ retries; the pre-write check makes those retries safe.

## Public API, MCP, SDK, CLI

One new operation in `packages/operations/src/operations/signals.ts`, appended to `signalsModule.operations`:

| Field | Value |
| --- | --- |
| `method` / `path` | `post` `/{signalSlug}/feedback` |
| `name` | `submitSignalFeedback` |
| `group` / `sdkMethod` | `signals` / `submitFeedback` |
| `summary` | `Submit signal feedback` |
| `access` | `write` — additive and one-shot; a second call is refused rather than overwriting |
| `rateLimitTier` | `medium` |

`description`: "Records a one-time verdict on whether the signal is a real problem, with an optional reason. Feedback cannot be changed once submitted." Two plain sentences, no internal mechanics, nothing about dogfood projects or queues.

Body (`SubmitSignalFeedbackBody`):

- `passed: boolean` — "`true` when the signal is a real problem worth flagging; `false` when it is a false positive."
- `feedback?: string` (≤ `SIGNAL_FEEDBACK_MAX_LENGTH`) — "Reason for the verdict. Required when `passed` is `false`."
- `value?: number` (`[0, 1]`) — "Normalized score for the signal's usefulness. Defaults to `1` when `passed` is `true` and `0` otherwise."
- `ignore?: boolean` (default `false`) — "Also archive the signal so new occurrences stop being reported."

The body mirrors `createAnnotation`'s `{ value, passed, feedback }` rather than inventing a verdict enum, so the whole surface speaks one vocabulary and an agent that can annotate a trace already knows how to grade a signal ([D8](#decisions)).

Response `201` (`SignalFeedbackSchema`): `{ value, passed, feedback, ignored }`. Domain failures reach the client through `honoErrorHandler` — 409 when feedback already exists, 422 when a failed verdict has no reason — so `typedResponses` declares only the 201, as the sibling signal operations do.

Read side: `SignalDetailSchema` gains `feedback: { value, passed, feedback } | null`, mapped in `toSignalDetailResponse` from the stored record as-is. Detail only; the list row payload stays lean. An agent doing bulk triage reads the signal before grading it, and the one-shot rule makes "has this been graded?" a real question a tool caller needs answered.

MCP gets the tool automatically. The operation needs no caller identity at all — the row stores no author — so the API-key and OAuth paths behave identically here, unlike `createAnnotation`. Both shipped toolsets (`read-only`, `signal-agent`) are read-only, so the new write operation is filtered out by the access ceiling and their manifest snapshots must not change — verify, don't assume.

Regenerate in the same PR: `pnpm openapi:emit`, `pnpm mcp:emit`, then `pnpm generate:all` for both SDKs and the CLI, plus the SDK version bumps and the matching new `## [X.Y.Z]` entry in `packages/cli/CHANGELOG.md` so the new command actually ships.

## Web wiring

- **Server fn** `submitSignalFeedback` (`POST`) in `apps/web/src/domains/signals/signals.functions.ts`: `resolveOrgScope(context)`, then the domain use-case under `withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive), …)` — the same layer set `applySignalLifecycleAction` composes, since the ignore branch runs inside the use-case. Input validated with the same "a failed verdict needs a reason" refinement the operation applies.
- **Collection** `apps/web/src/domains/signals/signals.collection.ts`: a `useSubmitSignalFeedback` mutation that calls `invalidateSignalQueries(projectId, signalId)` on success. `SignalDetailRecord` gains `feedback`.
- **Component** `apps/web/src/routes/_authenticated/projects/$projectSlug/signals/$signalSlug/-components/signal-feedback.tsx`, following the sibling `-components/` convention and the `enrichment-popover.tsx` structure (local `passed` / `reason` state, single-flight submit, `useToast`).
- **Layout** `apps/web/src/layouts/ListingLayout/index.tsx`: the optional `titleAside` slot described in [UX](#ux).

## Decisions

- **D1 — The verdict lands on Latitude's flagger traces, not on the customer's.** The stated purpose is grading our flagging system, and the dogfood route reaches the exact generations that made each decision. It also keeps the customer's score data untouched: no discovery-eligibility exception, no occurrence inflation, no alignment-example reshaping. The cost is that the customer cannot see the labels anywhere except the filled thumb on the signal.
- **D2 — A reason is required on 👎, optional on 👍.** Mirrors the shipped enrichment review. A false positive without a reason cannot be acted on; a confirmation without one is still useful.
- **D3 — Every flagger-authored occurrence among the last 25 is labelled, whatever its slug.** Signals cluster per project, not per flagger, so a noisy pattern is routinely detected by several slugs; restricting to the slug that created the signal would drop most of the labels and would produce none at all when that flagger has gone quiet. Each job carries the row's own `flaggerSlug`, so attribution stays exact.
- **D4 — The control renders on every signal.** The selection step naturally finds nothing to label on annotation-, custom-, or user-origin signals, and the row-level verdict is worth having regardless. One rule beats three.
- **D5 — Feedback is immutable, enforced by a conditional claim on `feedback IS NULL` rather than a read-then-write.** The latch is the product rule, and the claim makes it true under concurrency instead of merely usually true.
- **D6 — The fan-out goes through the outbox, not a publish from the request path.** Feedback is one-shot: if the labels were lost because Redis blinked after the row was stamped, there would be no way to ask again.
- **D7 — `Save and ignore` composes the existing lifecycle command inside the use-case.** Both the UI and the API get the shortcut from one seam, and the ignore semantics (mute, evaluation archive, escalation close) stay in exactly one place.
- **D8 — Feedback is stored as one nullable JSONB column holding a score's core triple (`value`, `passed`, `feedback`), not as a set of scalar columns.** A verdict on a signal is a score, so it should use the score vocabulary end to end: the wire body, the row, the event, the queue payload, and the dogfood annotation all carry the same three fields with no translation layer, and `null` is the entire "not yet graded" state. It also refuses two things nothing needs: an author and a timestamp. Consequences accepted deliberately — no "graded by X on Y" attribution anywhere, and no queryable feedback columns, so a future "show me unreviewed signals" filter is `feedback IS NULL` (cheap) while "show me every 👎" would need a JSONB path predicate (see [Q3](#open-questions)).
- **D9 — Every hop is an in-process domain use-case; nothing goes out over the Latitude SDK.** The customer-facing action is `submitSignalFeedbackUseCase`, called by the web's TanStack server fn and by the `defineOperation` handler that becomes the REST endpoint, the MCP tool, the SDK method and the CLI command — one seam, two callers. The dogfood write is `recordSignalFlaggerReviewUseCase` composing `writePublishedAnnotationUseCase` against a scope pinned to the dogfood organization, because that organization is in the same database ([Ground truth](#ground-truth--what-exists-today)). Skipping the loopback removes the public contract's exactly-one-matching-trace rule, removes the 400/404/rate-limit failure modes, allows a pre-write duplicate check that makes retries idempotent, and lets the whole path be tested on the PGlite/chdb testkit instead of a fake `fetch`. The cost is one deliberate cross-organization write in a worker, fenced by the rules in [Fan-out](#fan-out-to-the-flaggers-own-traces). The two shipped review flows keep their HTTP client for now; converting them is a follow-up, not this feature's business.
- **D10 — The flagger score stores a pointer to the generation that produced it (`metadata.flaggerTraceId`); the feedback path never searches for it.** The alternative was to reconstruct the link at read time by filtering dogfood traces on `metadata.traceId` + `metadata.flaggerSlug`, which needs a new `stage: "classification"` marker to tell a run's two or three traces apart, still cannot separate two classifications of the same trace across session generations, and is a query standing in for a foreign key. Writing the id once, at the moment we know it, is exact, cheaper to read, and reusable by anything else that needs to get from a detection back to the decision behind it. It costs one optional field on `GenerateResult`, one value threaded through the classification workflow, and one metadata key. Both designs are forward-only, so the pointer gives up nothing the filter would have had.

## Out of scope

- **Editing, undoing, or re-grading a signal.** The latch is deliberate; a second submission is a 409.
- **Feedback from the signals list, the session-detail signal slot, or the command palette.** Detail page only.
- **Any score written into the customer's project** (see D1), and therefore any change to `checkEligibilityUseCase`, ClickHouse analytics, or alignment example selection.
- **A flagger-precision dashboard.** The labelled dataset lands in `latitude-flaggers`, where the product's own signals and evaluations already apply; reading it is separate work.
- **Notifications or agent dispatch on feedback.** Nobody needs to be paged because a customer graded a signal.
- **Backfilling the flagger-trace pointer onto existing flagger scores.** It was never captured, and telemetry metadata cannot be re-derived reliably; older occurrences are simply skipped.
- **Converting the enrichment and system-annotator review flows off the loopback SDK.** Both could now use the same in-process write, and probably should, but they are shipped and working; this feature does not touch them, and `ProductFeedbackClient` / `@platform/latitude-api` stay in place for them.
- **Aggregating a verdict onto related or duplicate signals.** One verdict, one signal.

## Open questions

1. **Should the adversarial-review generation be graded too?** The review pass is the primary precision guard and a second, separately traced decision, so a false positive means both the classifier *and* the reviewer were wrong. Capturing its trace id as well is the same four steps and would double the labelled surface. Not in the MVP — one decision, one label — but it is the obvious next increment.
2. **Coverage measurement.** After a week, count graded signals against dogfood annotations actually written. The gap is scores predating the pointer plus deterministic detections; if it stays large, that argues for grading the deterministic path some other way (or for accepting that those flaggers are measured only by bug reports).
3. **Verdict visibility beyond the detail page.** Should the signals list expose a "not yet reviewed" filter or a column, and should the CSV export carry the verdict? `feedback IS NULL` is a cheap predicate; filtering on the *polarity* would need a JSONB path expression (`feedback->>'passed'`) and, if it ever gets hot, an expression index — the first thing that would argue for promoting `passed` back out into a column ([D8](#decisions)). Deliberately absent from the MVP.
4. **Reason length.** 2,000 chars is a guess for a one-line reason box. Lower it if reasons come back as pasted transcripts.
5. **Should a 👎 verdict feed back into promotion or discovery for the customer's project** — for example lowering the weight of the flagger slug that produced it in that project? Real, and a much larger design; explicitly not this feature.

## Testing plan

Per the testing skill: PGlite testkit for repository-backed work, no `vi.mock` for repositories, HTTP mocked at the adapter boundary, no component tests.

- **Domain (`@domain/signals`)**: `claimFeedback` writes once and returns `false` on the second call; the use-case fails 409 on a repeat and 422 on `passed: false` with a blank or whitespace reason; the stored record trims the reason and derives `value` (`1` / `0`) when the caller omits it while honouring an explicit one; the outbox payload carries the same triple; `ignore: true` archives the signal and `ignore: false` leaves it active; a cross-project or unpromoted signal id is rejected.
- **Selection (`reviewSignalFlaggerOccurrencesUseCase`)**: only `sourceId: "SYSTEM"` annotation rows with a `flaggerSlug` are selected; drafts, evaluation and custom rows, and rows without a `traceId` are skipped; `(traceId, flaggerSlug)` duplicates collapse to one job; the scan stops at 25 occurrences; a signal with no flagger occurrences publishes nothing.
- **The flagger-trace pointer**: `runWithAiTelemetry` surfaces the capture's trace id (extend the existing `@platform/ai-latitude` e2e propagation test, which already asserts metadata survives every hop); a cached generate result carries **no** trace id; the classify → workflow → save chain threads it; `upsertFlaggerAnnotationScore` persists it and the deterministic screening path writes a score without it.
- **The dogfood write (`recordSignalFlaggerReviewUseCase`)**, on the PGlite + chdb testkit with a seeded dogfood organization, project and trace: the triple is forwarded unchanged and the canned text substitutes only for a bare 👍; a trace id absent from the dogfood project is skipped (tenancy guard); a second run writes nothing (the duplicate check); the written row lands in the dogfood organization with `sourceId: "API"` and `annotatorId: null`; **no row is written into the customer's organization**; a missing telemetry API key or missing `latitude-flaggers` project skips without failing.
- **Worker**: `issues:reviewFlaggerOccurrences` fans out one `reviewFlaggerOccurrence` job per target, and the per-target handler composes both organization scopes correctly.
- **API (`apps/api/src/routes/signals.test.ts`)**: 201 with the feedback record; 409 on a second submission; 422 on `passed: false` without a reason; a reason longer than `SIGNAL_FEEDBACK_MAX_LENGTH` is rejected at the boundary; `ignore: true` flips the signal to archived; a signal from another project 404s; `getSignal` exposes `feedback` after submission and `null` before. One MCP case in `apps/api/src/mcp/server.test.ts`.
- **Manifests**: `pnpm openapi:emit` / `pnpm mcp:emit` produce no drift after commit; the toolset manifest snapshots are unchanged; the new tool's `annotations` read `{ readOnlyHint: false, destructiveHint: false }`.
- **Manual QA**: on staging, grade one flagger-born signal 👍 and another 👎 + `Save and ignore`, then confirm in the `latitude-flaggers` project that the expected number of annotations landed on the flagger traces with the right polarity and text; confirm the second attempt on the same signal is refused; confirm a signal with no flagger occurrences saves cleanly; confirm the header control is right-aligned and vertically centered at narrow and wide widths, and that other `ListingLayout.Header` pages are visually unchanged.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> The whole spec ships as **one PR** against `development`; the phases below are its commit structure, not separate PRs.

### Phase 1 — The latch (storage + domain + event)

- [ ] **P1-1**: Add the nullable `feedback` JSONB column to the Drizzle schema and generate the migration with `pnpm --filter @platform/db-postgres pg:generate` (ask before running it).
- [ ] **P1-2**: `signalFeedbackSchema` + `feedback` on the `Signal` entity and the Postgres mappers; add the two new constants.
- [ ] **P1-3**: `SignalRepository.claimFeedback` — port method with the conditional-claim JSDoc, plus the adapter implementation.
- [ ] **P1-4**: `SignalFeedbackAlreadySubmittedError` (409) and `SignalFeedbackReasonRequiredError` (422) in `@domain/signals/errors.ts`, wired into the use-case's error union.
- [ ] **P1-5**: `submitSignalFeedbackUseCase` — validation, `value` derivation, claim, outbox write, optional `ignore` composition, return record.
- [ ] **P1-6**: `SignalFeedbackSubmitted` in `event-payloads.ts` with the payload doc comment.
- [ ] **P1-7**: Tests per the [testing plan](#testing-plan) (domain + repository).

**Exit gate**: a signal can be graded exactly once through the use-case; the second attempt 409s; `ignore: true` archives it; the outbox carries one `SignalFeedbackSubmitted` per graded signal.

### Phase 2 — Fan-out to `latitude-flaggers`

- [ ] **P2-1**: `GenerateResult.telemetryTraceId` in `@domain/ai` + the `@platform/ai-latitude` / `@platform/ai-vercel` plumbing that reads the trace id inside `capture`, deliberately **excluded** from the AI cache schema (with the comment explaining why).
- [ ] **P2-2**: Thread `flaggerTraceId` through `RunFlaggerResult` → `ClassifySessionFlaggerResult` → the classification workflow → `saveSessionFlaggerAnnotation` → `upsertFlaggerAnnotationScore`, and add the optional field to `annotationScoreMetadataSchema`.
- [ ] **P2-3**: `issues:reviewFlaggerOccurrences` + `issues:reviewFlaggerOccurrence` topic entries and the dispatcher publish for `SignalFeedbackSubmitted`.
- [ ] **P2-4**: `reviewSignalFlaggerOccurrencesUseCase` (selection, dedupe by flagger trace) + the signals-worker subscription, including the summary log line.
- [ ] **P2-5**: Memoized dogfood-organization resolver over `ApiKeyRepository.findByTokenHash` (reusing the existing token-hash helper), returning nothing when the telemetry key is absent or unknown.
- [ ] **P2-6**: `recordSignalFlaggerReviewUseCase` in `@domain/product-feedback` — project resolution, trace-belongs-to-project check, duplicate check, `writePublishedAnnotationUseCase` under the dogfood scope — plus the per-target worker subscription that composes both organization scopes.
- [ ] **P2-7**: Tests per the [testing plan](#testing-plan) (pointer capture and cache exclusion, selection, dogfood write, tenancy assertion, worker wiring).

**Exit gate**: a flagger detection records the trace of the generation that produced it; grading a seeded flagger-born signal writes one annotation per distinct flagger trace among its last 25 occurrences, in the dogfood organization, with the right polarity and text; a re-run writes nothing new; a missing telemetry key or a pre-pointer occurrence skips cleanly; nothing at all is written into the customer's organization.

### Phase 3 — Public API, MCP, SDK, CLI

- [ ] **P3-1**: `submitSignalFeedback` operation with fully described schemas; registered in `signalsModule.operations`.
- [ ] **P3-2**: `feedback` on `SignalDetailSchema` + `toSignalDetailResponse`.
- [ ] **P3-3**: `apps/api` route tests + one MCP server test.
- [ ] **P3-4**: `pnpm openapi:emit` + `pnpm mcp:emit`; confirm the toolset snapshots are unchanged and the tool annotations are right.
- [ ] **P3-5**: `pnpm generate:all`, SDK version bumps, and a new `packages/cli/CHANGELOG.md` entry.

**Exit gate**: an agent over MCP can grade a signal and read the verdict back; both manifests and all three generated surfaces are drift-free in CI.

### Phase 4 — The control on the signal page

- [ ] **P4-1**: `titleAside` slot on `ListingLayout.Header`.
- [ ] **P4-2**: `submitSignalFeedback` web server fn + `useSubmitSignalFeedback` mutation + `feedback` on `SignalDetailRecord`.
- [ ] **P4-3**: `signal-feedback.tsx` — idle thumbs, popover with textarea, per-verdict footer buttons, disabled-until-reason on 👎, single-flight submit, toasts, collapsed post-submission thumb with the reason tooltip.
- [ ] **P4-4**: Mount it in the signal detail header and check the other `ListingLayout.Header` pages are unchanged.

**Exit gate**: the manual QA list in the [testing plan](#testing-plan) passes on staging.

### Phase 5 — Docs

- [ ] **P5-1**: `dev-docs/signals.md` — the feedback latch, its immutability, the `Save and ignore` shortcut, and the detail-page surface.
- [ ] **P5-2**: `dev-docs/flaggers.md` — the flagger-trace pointer on flagger scores, which paths carry it, and what the `latitude-flaggers` annotations mean.
- [ ] **P5-3**: `dev-docs/scores.md` (`metadata.flaggerTraceId` on flagger annotation rows) and `dev-docs/ai-generation-features.md` (`telemetryTraceId` and the dogfood write-back).
- [ ] **P5-4**: Resolve or file follow-ups for [Q2](#open-questions)–[Q5](#open-questions); delete this spec once the docs carry the durable knowledge.

**Exit gate**: docs describe the shipped behavior with no spec left as the only source of truth.
