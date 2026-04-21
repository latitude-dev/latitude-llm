# Dogfood Annotations for System Annotator & Enrichment

## Summary

Latitude is an observability platform. We want to use our own platform to evaluate the quality of our own AI features — starting with (1) the **System Annotator** (LLM-generated draft annotations produced by `systemQueueFlaggerWorkflow` via `draftSystemQueueAnnotationUseCase`) and (2) the **annotation enrichment** pass (`enrichAnnotationForPublicationUseCase`). When a reviewer approves/rejects a System Annotator output or thumbs-up/down an enrichment result, Latitude writes a score into its own dogfood project through the public API. Those scores feed the normal Latitude reliability pipeline (issue discovery, evaluation alignment, analytics), so our internal teams can triage regressions in our own AI features the same way customers triage theirs.

To make this work we need three things that are also valuable beyond dogfooding:

1. A first-class public **TypeScript SDK** generated from our OpenAPI via [Fern](https://buildwithfern.com/learn/sdks/overview/introduction), published to npm as the next major of `@latitude-data/sdk` (starting at `6.0.0-alpha.0`).
2. Two changes to the public annotations API: **publish-by-default** with an explicit `draft: true` opt-in, and **trace resolution by id *or* filters** so callers who don't have the raw OpenTelemetry trace id can identify a trace by metadata attributes.
3. A new domain package **`@domain/product-feedback`** that models "Latitude scoring Latitude's own AI outputs" as a separate bounded context, with an infrastructure adapter **`@platform/latitude-api`** that calls the Latitude public API through the generated SDK.

The UI surface (approve/reject buttons, enrichment thumbs-up/down) is visible to all users, but its primary purpose is to feed the Latitude-owned dogfood project. Customer signals collected through it are a bonus, not the goal.

## Goals

- Reviewers approve/reject a System Annotator draft annotation and produce a score in the Latitude dogfood project.
- Reviewers mark an enrichment result as good/bad from the existing enrichment popover and produce a score in the Latitude dogfood project.
- The approve/reject/👍/👎 decision is always final on click; an optional (or required-on-reject) "why" textarea appears afterwards without blocking or reversing the decision.
- All product-feedback writes go through a generated **Latitude TypeScript SDK** — never via hand-written `fetch` calls to our own API.
- The public annotations API is publish-by-default, accepts `draft: true` to opt into the draft path, and resolves the target trace by either `traceId` or a `FilterSet`.
- A new workflow publishes `@latitude-data/sdk` as `6.0.0-alpha.0` to npm, mirroring `packages/telemetry/typescript` and its `.github/workflows/publish-typescript-telemetry.yml`.

## Non-goals

- Migrating existing annotation write paths (managed UI, queue review, internal use cases) onto the SDK. They keep calling their internal use cases directly.
- Publishing the Python SDK. We scaffold the Fern config for both languages but only wire and publish TypeScript in this epic.
- Building a new UI surface for reviewing dogfood scores — we reuse the existing Latitude project UI on the dogfood tenant.
- Any expansion of System Annotator or enrichment behavior itself.
- Feature-flagging product feedback. It is always enabled for all users.

## Current state (what already exists)

- **System Annotator approve/reject buttons** already render on draft annotations with `provenance === "agent"` via `AnnotationApprovalButtons` in `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/annotations/annotation-card.tsx:39`. They call `useApproveSystemAnnotation` / `useRejectSystemAnnotation` from `apps/web/src/domains/annotations/annotations.collection.ts:93`. **Today they do not emit a dogfood score and are single-click with no comment capture.**
- **Enrichment popover** already exists in `annotation-card.tsx:239`: a Sparkles button that opens a Popover showing `rawFeedback` when enriched feedback differs from raw. It has **no good/bad control yet**.
- **Public annotations endpoint** exists at `POST /v1/organizations/:organizationId/projects/:projectId/annotations` (`apps/api/src/routes/annotations.ts:1`). It forces `sourceId = "API"` and **always writes a draft** via `writeDraftAnnotationUseCase`. No `draft` flag, no trace-filter lookup.
- **OpenAPI spec** is served live at `GET /openapi.json` via `@hono/zod-openapi` (`apps/api/src/server.ts:59`). **Not emitted to disk.**
- **No SDK package** exists. There is a `@latitude-data/telemetry` pattern at `packages/telemetry/typescript` with a `publish-typescript-telemetry.yml` workflow we can mirror.
- **Existing env vars** already in use: `LATITUDE_API_KEY`, `LATITUDE_PROJECT_SLUG`. Product feedback reuses them — no new env vars.
- **Trace filter lookup** primitive exists: `TraceRepository.listByProjectId(filters)` using the shared `FilterSet` (`packages/domain/shared/src/filter.ts`). Not yet exposed through the annotations endpoint.

## User flows

### Flow 1 — Approve / Reject on System Annotator draft annotation

1. Reviewer is in the queue review screen. A draft annotation card (provenance `agent`) shows **Approve** and **Reject** buttons.
2. Reviewer clicks Approve **or** Reject. The decision is **final**: the existing internal business logic runs immediately (approve publishes the draft, reject deletes it), exactly as today.
3. A **popover/modal** appears anchored on the same card, styled like the existing enrichment popover:
   - Title: *"Tell us why"*
   - Helper text under the title: *"Your comment is sent to Latitude so we can improve our automatic annotations."*
   - Textarea: optional on Approve, **required** on Reject. Submit disabled until non-empty on Reject.
   - Buttons: *Skip* (approve path only — closes with no comment) and *Submit*.
4. On submit, the UI POSTs the comment to a web-route that runs on our backend, which **enqueues a BullMQ job** (`product-feedback:submit-system-annotator-review`) and returns 202 immediately. The user is not blocked on the API round-trip to latitude.so.
5. The background worker consumes the job, builds an annotation payload, and writes it to the Latitude dogfood project via the generated SDK. The payload identifies the upstream telemetry trace by filtering Latitude spans where `metadata.scoreId == <upstream draft annotation id>` — see **Identity strategy** below. Retries on 5xx/network errors use BullMQ's built-in retry policy. Permanent 4xx errors log `warn` and complete the job.

### Flow 2 — Good / Bad on enrichment result

1. Reviewer opens the enrichment popover (Sparkles icon) on a published annotation whose `rawFeedback` differs from `feedback`.
2. The popover gains two controls under the enriched text, preceded by the helper text *"Let Latitude know how this enrichment looks — your feedback helps us improve."*:
   - 👍 **Good**: one click. Fires immediately; no textarea.
   - 👎 **Bad**: one click. A textarea slides into the popover with a **required** reason; submit enqueues.
3. On submit, the UI POSTs to the same backend route pattern used for the System Annotator flow, which enqueues `product-feedback:submit-enrichment-review`.
4. The worker builds an annotation payload and writes it to the Latitude dogfood project via the SDK. The payload identifies the upstream telemetry trace by filtering Latitude spans where `metadata.scoreId == <published score id>` — see **Identity strategy** below.
5. After submit, the controls disable in the popover and show *"Thanks — feedback recorded"* until page reload, preventing accidental duplicate submissions.

## Architecture

### Bounded contexts

```
apps/web  ──►  apps/api route  ──enqueue──►  BullMQ: product-feedback topic
                                                      │
                                                      ▼
                            @domain/product-feedback (use cases: recordSystemAnnotatorReview, recordEnrichmentReview)
                                                      │
                                                      ▼ port: ProductFeedbackClient
                                                      │
                                                      ▼ adapter
                                               @platform/latitude-api
                                                      │
                                                      ▼ wraps
                                              @latitude-data/sdk (Fern-generated)
                                                      │
                                                      ▼ HTTP
                                              latitude.so  POST /v1/.../annotations
```

### New packages

#### `@domain/product-feedback`

Owns the business rules for Latitude scoring its own AI feature outputs.

- Use cases:
  - `recordSystemAnnotatorReviewUseCase({ upstreamScoreId, decision: "approve" | "reject", comment?: string, queueSlug })`
  - `recordEnrichmentReviewUseCase({ upstreamScoreId, decision: "good" | "bad", comment?: string, rawFeedback, enrichedFeedback })`
- In both cases the `upstreamScoreId` is the id of the score row in our own database — used as the telemetry-trace-lookup filter on the Latitude side.
- Port: `ProductFeedbackClient` with `writeAnnotation(input: ProductFeedbackAnnotationInput): Promise<Result<void, ProductFeedbackError>>`.
- No enabled/disabled gating — always on.

Naming rationale: "product-feedback" is domain-shaped (matches `@domain/annotations`, `@domain/evaluations`, `@domain/issues`), covers the dogfood use case today, and leaves room for future internal-feedback sources (NPS prompts, in-product surveys) without a rename.

#### `@platform/latitude-api`

Implements `ProductFeedbackClient` and acts as the general-purpose Latitude public-API adapter for any future server-side calls we need to make into the Latitude platform.

- Depends on `@latitude-data/sdk` (generated).
- **Setup-client pattern** mirroring other platform adapters (e.g. how `@platform/ai-latitude` / `@platform/analytics-posthog` construct a singleton from env):
  - Reads `LATITUDE_API_KEY` and `LATITUDE_PROJECT_SLUG` (already in use for telemetry).
  - Exports `createLatitudeApiClient({ apiKey, projectSlug, baseUrl? })` returning an instance that wraps the SDK client with our retry/logging defaults.
  - The adapter's composition-root wiring reads env once at boot and registers a single instance.
- On transient failures (5xx, network), retries with exponential backoff consistent with BullMQ job retry config and the retry helpers in `@repo/utils`.
- On permanent failures (4xx), logs at `warn` with the upstream request id and completes the job — product feedback must never block user-facing actions.

#### `@latitude-data/sdk` (generated by Fern)

Thin generated client targeting our OpenAPI spec, published to npm as the next major:

- Workspace path: `packages/sdk/typescript/`.
- **Publishing**: next major as `6.0.0-alpha.0` of `@latitude-data/sdk`. The workflow mirrors `.github/workflows/publish-typescript-telemetry.yml`: trigger on `push` to `main` under `packages/sdk/typescript/**`, diff local `package.json` version vs the npm registry, build/typecheck/lint/test, then `pnpm publish --access public --no-git-checks` with `NPM_TOKEN`. Mark the GitHub release as `prerelease` when the version contains `alpha` / `beta` / `rc`.
- Python SDK output is scaffolded in Fern config but **not built or published** in this epic.
- Regenerated via `pnpm sdk:generate`:
  1. `pnpm --filter @apps/api openapi:emit` → writes `apps/api/openapi.json`.
  2. `fern generate --local` → writes into `packages/sdk/typescript/src/generated/`.
- The generated code is checked in; consumers don't need Fern installed.
- CI enforces drift: if `apps/api/openapi.json` changed without a matching SDK regeneration, CI fails (new step in the existing `check.yml` workflow).

### Wiring

**Web app (`apps/web`)**:
- `AnnotationApprovalButtons` adds the post-decision popover flow described in Flow 1. Local state is fine — keep it in `-components/` per the web-frontend skill rules.
- The enrichment popover in the same component gains the 👍/👎 controls + textarea.
- Web routes call a server endpoint that enqueues the job — the UI never imports `@platform/latitude-api` directly.

**API app (`apps/api`)**:
- New web route (or two) under the existing annotations router: `POST /annotations/:annotationId/product-feedback/system-annotator` and `POST /scores/:scoreId/product-feedback/enrichment`. Each validates input, enqueues the BullMQ job, returns `202 Accepted` with `{ enqueued: true }`.
- These endpoints are **internal-auth** (session) only, not exposed in the public OpenAPI spec.

**Workers (`apps/workers`)**:
- New `product-feedback` queue + worker. Consumes both job names, calls the relevant `@domain/product-feedback` use case, surfacing errors through the standard BullMQ failure/retry contract.

## Annotations API changes (full detail)

This section consolidates every change to `POST /v1/organizations/:organizationId/projects/:projectId/annotations`. Rationale included for each; we accept breaking changes because the endpoint has no known external consumers today.

### Motivation

1. **Publish by default.** Customers today call this endpoint expecting to record a reviewer's judgement; silently putting it in draft mode creates a 5-minute invisibility window that surprises users and makes the endpoint behave like a delayed write. Draft mode is a *power-user feature* (for human-editable review flows), not a sensible default.
2. **Trace lookup by filter.** The public-API caller usually does not have the raw 128-bit OpenTelemetry trace id at hand. They do have business identifiers embedded in span attributes (`metadata.userId`, `metadata.requestId`, etc.). Requiring them to surface the raw OTel traceId is a footgun. Allowing `FilterSet` lookup mirrors the filtering the rest of our platform already supports.
3. **Single public use case.** The ingestion path must branch on `draft` and resolve the trace uniformly. One use case, one Zod schema, one error surface.

### Request schema

```ts
// packages/domain/annotations/src/helpers/annotation-public-api-schema.ts
const traceRefSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("id"), id: z.string() }),
  z.object({ by: z.literal("filters"), filters: filterSetSchema }),
])

const publicAnnotationInputSchema = z.object({
  trace: traceRefSchema,
  draft: z.boolean().default(false),
  // annotator-authored score fields
  passed: z.boolean(),
  value: z.number(),
  feedback: z.string(),
  issueId: z.string().nullable().optional(),
  // anchor fields (conversation-level annotations omit all of them)
  messageIndex: z.number().int().nonnegative().optional(),
  partIndex: z.number().int().nonnegative().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).default({}),
})
```

The old top-level `traceId` field is removed. Callers migrate to `{ trace: { by: "id", id } }`. Anchor fields keep their current names and validation.

### Behavior

- `draft: false` (the new default) writes the canonical score with `draftedAt = null`, emits `ScoreCreated` in the same transaction, and lets issue discovery pick it up immediately. This matches the documented "human-created annotations are the strongest human signal" rule in `docs/annotations.md`, minus the 5-minute debounced publication window.
- `draft: true` preserves today's behavior: writes with `draftedAt` set, publication driven later by the debounced `annotation-scores:publish` topic task.
- `trace.by === "id"`: verified via `TraceRepository.matchesFiltersByTraceId` to belong to the caller's org + project; **404** with a human-readable `{ error: string }` body when the id does not resolve inside the project. Cross-tenant probing returns the same 404 shape as a genuinely missing trace.
- `trace.by === "filters"`: `TraceRepository.listByProjectId({ filters, limit: 2 })`.
  - 0 results → **404** with `{ error: "…No trace in this project matches the provided filters…" }`.
  - 2 results → **400** with `{ error: "Trace filter matched more than one trace in this project. Refine the filter set so it identifies exactly one trace." }`.
  - 1 result → proceed with that trace id.

Error responses use the existing `{ error: string }` shape produced by the shared `honoErrorHandler` (see `apps/api/src/middleware/error-handler.ts`). Structured machine-readable codes (e.g. `{ code: "trace_not_found" }`) are out of scope for this PRD — the error handler does not surface them today, and adding one is a cross-cutting change that belongs in its own pass.
- `sourceId` is still forced to `"API"` — **the existing `source`/`source_id` enum is not extended**.

### New use case

Add `submitApiAnnotationUseCase` in `packages/domain/annotations/src/use-cases/submit-api-annotation.ts`. The `Api` qualifier distinguishes this public-API entry from any future internal-only submission path. Responsibilities:

1. Validate input.
2. Resolve `trace.by` to a concrete `traceId` (delegating to the trace repository for the filter case, returning `TraceNotFound` / `TraceFilterAmbiguous` tagged errors).
3. Branch on `draft`:
   - `true`: delegate to the existing `writeDraftAnnotationUseCase`.
   - `false`: delegate to a new `writePublishedAnnotationUseCase` that writes with `draftedAt = null` and emits `ScoreCreated` inside the transaction.
4. Return the canonical score record to the route.

Naming rationale: `submit` captures "public-API entry point that takes a caller-provided description of *what* and figures out *where*"; the `Api` qualifier keeps the door open for a future internal equivalent; and `writeDraft` / `writePublished` remain as the low-level persistence primitives this use case delegates to.

### OpenAPI emission script

- Add `apps/api/scripts/emit-openapi.ts`:
  - Instantiates the Hono app without starting a listener.
  - Invokes the openapi handler in-process.
  - Writes the JSON to `apps/api/openapi.json`.
- Wire `pnpm --filter @apps/api openapi:emit`.
- Every public route gets a stable `operationId` so Fern produces stable method names — one-time sweep of `apps/api/src/routes/*.ts`.
- Response schemas get `description` fields so Fern surfaces JSDoc on the generated methods.
- CI: new step in `check.yml` re-runs the emit script and fails if the working tree is dirty.

## SDK generation & publishing

### Fern setup

- `fern/` at the repo root with `generators.yml` producing TypeScript (and scaffolding Python for later).
- `fern/fern.config.json` points at `apps/api/openapi.json`.
- Output goes to `packages/sdk/typescript/src/generated/` (regenerated) with a hand-written `packages/sdk/typescript/src/index.ts` re-export that we control.
- Scripts on root `package.json`:
  - `sdk:emit-openapi`: runs the emit script.
  - `sdk:generate`: emit + `fern generate --local`.
  - `sdk:check`: runs both and fails if the working tree is dirty.

### Publishing to npm

- Package name: `@latitude-data/sdk`. Start at version `6.0.0-alpha.0`.
- Workflow: new `.github/workflows/publish-typescript-sdk.yml` mirroring `publish-typescript-telemetry.yml`:
  - Triggers on `push` to `main` under `packages/sdk/typescript/**`.
  - Reads version from `packages/sdk/typescript/package.json`, compares with npm registry, publishes only on version bump.
  - Runs build/typecheck/lint/test filtered to `@latitude-data/sdk`.
  - `pnpm publish --access public --no-git-checks` with `NPM_TOKEN`.
  - Creates a GitHub release tagged `typescript-sdk-<version>`, marked `prerelease` when the version contains `alpha`/`beta`/`rc`.

## Identity strategy: how a review is linked to the right upstream trace

The annotation we write into the Latitude dogfood project must reference the trace that produced the thing being reviewed — **not** the end-user trace being annotated (which is what `score.traceId` already stores).

Rather than invent a new identifier, we reuse the id we already need: the **`scoreId`**. In both the System Annotator and Enrichment flows the score row ends up with a generated CUID. The same CUID is stamped onto the Latitude telemetry span that produced it, so later we can filter Latitude's traces by `metadata.scoreId == <cuid>` to find the exact trace.

The key constraint we have to respect: the LLM call (which emits the telemetry span) happens in a **different code path** from the row persistence (which generates the id today). So we need to move id generation upstream — before the LLM call — and pass it through both sides.

### System Annotator

Today the Temporal workflow in `apps/workflows/src/workflows/system-queue-flagger-workflow.ts:46-70` runs two activities sequentially:

1. **`draftAnnotate`** → delegates to `runSystemQueueAnnotatorUseCase` at `packages/domain/annotation-queues/src/use-cases/run-system-queue-annotator.ts:123`, which fires the LLM call and emits the Latitude telemetry span (`ai.generate(...)` with `telemetry.spanName = AI_GENERATE_TELEMETRY_SPAN_NAMES.queueSystemDraft`, `run-system-queue-annotator.ts:152`). **The span is written here.**
2. **`persistAnnotation`** → delegates to `persistSystemQueueAnnotationUseCase` at `packages/domain/annotation-queues/src/use-cases/persist-system-queue-annotation.ts:124`, which calls `writeDraftAnnotationUseCase` with `id: generateId<"ScoreId">()` (`persist-system-queue-annotation.ts:125`). **The score row id is generated here**, *after* the telemetry span has already been flushed.

The two moments are decoupled, which means the telemetry span today has no way to reference the future `scoreId`.

**Change**: move the `scoreId` generation upstream of the LLM call, and stamp it onto the telemetry span during `draftAnnotate` so the later persist step can reuse the same id.

**Where generation happens**: not in the workflow. `generateId()` uses `cuid2.createId()` which reads `crypto.getRandomValues` — non-deterministic and unsafe inside a Temporal workflow (workflow replay would reshuffle the ids). The generation lives inside `draftSystemQueueAnnotationUseCase` (which runs inside the `draftAnnotate` activity, where non-determinism is expected).

Concretely:

1. `draftSystemQueueAnnotationUseCase` generates `scoreId = generateId<"ScoreId">()` before invoking `runSystemQueueAnnotatorUseCase`, and returns it in the use case output alongside `queueId` / `feedback` / `traceCreatedAt`.
2. `runSystemQueueAnnotatorUseCase` accepts `scoreId` as input and includes it in the `telemetry.metadata` passed to `ai.generate(...)`. Latitude telemetry already forwards metadata to a `latitude.metadata` span attribute (JSON), so the resulting trace ingested by Latitude carries `metadata.scoreId = <cuid>`.
3. The `draftAnnotate` activity output surfaces `scoreId` up to the workflow, which forwards it verbatim to the `persistAnnotation` activity input.
4. `persistSystemQueueAnnotationUseCase` accepts `scoreId` and passes it as the `id` argument to `writeDraftAnnotationUseCase`, replacing the previous inline `generateId<"ScoreId">()`. Idempotency is preserved — the existing early-return branches still read from `scoreRepository.findQueueDraftByTraceId` before attempting insertion.

After this change: the UI has `annotation.id` (the draft annotation's `scoreId`) directly at hand when the reviewer clicks Approve/Reject. No extra metadata field is needed on the annotation row.

### Enrichment

The score row **already exists** when enrichment runs — it is the published human annotation being enriched. No id needs to be pre-generated; the existing `score.id` plays the same role as the pre-generated CUID above.

**Change**: in `enrichAnnotationForPublicationUseCase`, add `scoreId` to the `telemetry.metadata` of the enrichment `ai.generate(...)` call. That stamps `metadata.scoreId = <cuid>` on the enrichment LLM's Latitude telemetry span. When the reviewer clicks 👍/👎 in the enrichment popover, the UI already has `annotation.id`, which is the same `scoreId`.

### Product-feedback payload

In both flows, the BullMQ worker calls `POST /v1/.../annotations` on the Latitude dogfood project via the generated SDK with:

```ts
{
  trace: {
    by: "filters",
    filters: { "metadata.scoreId": [{ op: "eq", value: upstreamScoreId }] }
  },
  draft: false,
  passed, value, feedback,
  metadata: { kind: "system-annotator-review" | "enrichment-review", ... }
}
```

This makes the enrichment dogfood flow the first in-house caller of the new trace-filter resolution path, which is good — we exercise it immediately on our own traffic.

### Why the filter lookup is safe: spans are not dropped today

The strategy only works if the annotator/enrichment span actually reaches the Latitude dogfood project. We verified this holds under current config:

- **No head sampling** — `packages/observability/src/otel.ts:70-73` initializes `NodeSDK` with no sampler, so OTel defaults to `AlwaysOnSampler` (100%). `OTEL_TRACES_SAMPLER` / `OTEL_SDK_DISABLED` are not read.
- **Latitude span filter passes these spans** — `packages/telemetry/typescript/src/sdk/span-filter.ts:118-139` whitelists the `so.latitude.instrumentation.capture` scope (see `packages/telemetry/typescript/src/sdk/context.ts:61`). Both `queue.system.draft` and `annotation.enrich.publication` use that scope.
- **Span creation is unconditional** when `telemetry` is passed to `ai.generate(...)`, and both call sites always pass it (`packages/domain/annotation-queues/src/use-cases/run-system-queue-annotator.ts:146-160`, `packages/domain/annotations/src/use-cases/enrich-annotation-for-publication.ts:173-193`).

The only regression that would silently break the identity lookup would be someone adding `so.latitude.instrumentation.capture` to `blockedInstrumentationScopes`. We cover this with an end-to-end test (see Testing) that exercises the full loop LLM call → span export → filter lookup.

### Failure modes

- If the lookup on Latitude returns 0 traces → the telemetry span never made it to Latitude (likely a future regression of the guarantees above, or a network failure during export). Log `warn` and complete the job — no retry.
- If the lookup returns >1 traces → a `scoreId` collision, which should be impossible under CUID generation. Log `error` and complete the job.

## Annotation score shape

Mapping UI action → outbound annotation payload. All writes use `draft: false` and `sourceId = "API"` (we do **not** extend the existing `source` enum).

| Action | `passed` | `value` | `feedback` | `metadata` |
| --- | --- | --- | --- | --- |
| System Annotator approve (no comment) | `true` | `1` | `"Approved"` | `{ kind: "system-annotator-review", queueSlug }` |
| System Annotator approve (with comment) | `true` | `1` | comment | `{ kind: "system-annotator-review", queueSlug }` |
| System Annotator reject | `false` | `0` | reason (required) | `{ kind: "system-annotator-review", queueSlug, rejectedDraftFeedback }` |
| Enrichment 👍 | `true` | `1` | `"Good enrichment"` | `{ kind: "enrichment-review", rawFeedback, enrichedFeedback }` |
| Enrichment 👎 | `false` | `0` | reason (required) | `{ kind: "enrichment-review", rawFeedback, enrichedFeedback }` |

`trace` is always resolved via `{ by: "filters", filters: { "metadata.scoreId": [{ op: "eq", value: upstreamScoreId }] } }` — see **Identity strategy**. The upstream score id is not duplicated in `metadata` because it is already the trace-lookup key.

## Testing

- **Contract tests** for the new API behaviors (draft-by-default flip, `{ trace: { by } }` resolution, 404/400 error shapes) in `apps/api` using the Vitest + PGlite testkit per the testing skill.
- **Unit tests** for `submitApiAnnotationUseCase` covering id-path, filter-path (0/1/2 matches), and draft/published branching.
- **Unit tests** for `recordSystemAnnotatorReviewUseCase` / `recordEnrichmentReviewUseCase` with an in-memory `ProductFeedbackClient` fake.
- **Adapter test** for `@platform/latitude-api` using Fern's custom-fetcher option to assert request shape.
- **Worker test** for the `product-feedback` queue consuming a job and invoking the domain use case.
- **End-to-end identity test** that runs a real `ai.generate` call with a known `scoreId` in `telemetry.metadata`, flushes the span pipeline, and asserts the span reaches the export sink with `metadata.scoreId` set. Guards against a future regression in `span-filter.ts` or the OTel sampler config silently breaking the filter lookup.
- **UI**: start the dev server, approve with no comment, approve with a comment, reject without a comment (submit must stay disabled), reject with a comment. Exercise 👍 (no textarea) and 👎 (required textarea) in the enrichment popover. Confirm the existing approve/reject business logic fires before the popover opens and independently of whether the comment is submitted.

## Implementation plan

Five phases, each independently mergeable and verifiable. Each phase ends with a concrete **checkpoint** that must pass before the next phase starts. This ordering is deliberate: Phases 1 and 2 have no external-tool dependency (Fern, npm publish) and no risk to `main`; Phase 3 is isolated to tooling; Phases 4 and 5 depend on earlier phases.

### Phase 1 — Annotations API changes

Scope:

- [x] Add `writePublishedAnnotationUseCase` in `@domain/annotations` as the publish-now primitive (writes with `draftedAt = null`, emits `ScoreCreated` in the same transaction).
- [x] Add `submitApiAnnotationUseCase` in `packages/domain/annotations/src/use-cases/submit-api-annotation.ts` with trace resolution (id/filters) and draft/published branching, delegating to `writeDraftAnnotationUseCase` or `writePublishedAnnotationUseCase`.
- [x] Update `POST /v1/organizations/:organizationId/projects/:projectId/annotations` schema (discriminated `trace` union, `draft?: boolean` default `false`) in `packages/domain/annotations/src/helpers/annotation-public-api-schema.ts`.
- [x] Update `apps/api/src/routes/annotations.ts` to call `submitApiAnnotationUseCase` and surface `trace_not_found` / `trace_filter_ambiguous` error codes.
- [x] Contract tests (Vitest + PGlite) for all resolution paths and draft/published branching.

Checkpoint:

- [x] `pnpm --filter @app/api vitest run src/routes/annotations.test.ts` → 8/8 green.
- [x] `pnpm --filter @domain/annotations` direct vitest run → 54/55 green (the 1 failure in `write-annotation.test.ts > persists anchor metadata for a new annotation from flat fields` is **pre-existing on `main`** — diffed both `write-annotation.test.ts` and `resolve-write-annotation-trace-context.ts` against `origin/main`, identical; the test seeds an empty `allMessages` and then tries to resolve `messageIndex: 2`).
- [x] `pnpm --filter @app/api typecheck` green.
- [x] `pnpm --filter @domain/annotations typecheck` green.
- [x] No UI impact yet (diff confirms changes are scoped to `packages/domain/annotations/src/` and `apps/api/src/routes/annotations{,.test}.ts`).

### Phase 2 — scoreId identity plumbing

Scope:

- [x] ~~In `apps/workflows/src/workflows/system-queue-flagger-workflow.ts:46-70`, generate `scoreId = generateId<"ScoreId">()` and pass to both activities.~~ **Design deviation**: `generateId()` uses `cuid2.createId()` which reads `crypto.getRandomValues` — non-deterministic and unsafe inside a Temporal workflow (breaks replay). Moved generation inside `draftSystemQueueAnnotationUseCase` (runs inside the `draftAnnotate` activity). The use case returns the `scoreId` alongside `queueId`/`feedback`, the workflow forwards it verbatim to `persistAnnotation`. Same net effect — the LLM telemetry span and the persisted score row share the id — but generation happens in activity scope, not workflow scope.
- [x] Extend `draftAnnotate` activity **output** with `scoreId` (not input — the id is generated by the use case inside the activity).
- [x] Extend `persistAnnotation` activity input with `scoreId`.
- [x] In `packages/domain/annotation-queues/src/use-cases/run-system-queue-annotator.ts`, include `scoreId` in the `telemetry.metadata` passed to `ai.generate(...)`.
- [x] In `packages/domain/annotation-queues/src/use-cases/persist-system-queue-annotation.ts`, replace `id: generateId<"ScoreId">()` with the forwarded `scoreId`.
- [x] ~~In `packages/domain/annotations/src/use-cases/enrich-annotation-for-publication.ts`~~ — **already landed on `main` before Phase 2 started**: the enrichment `ai.generate(...)` already passes `scoreId` in its `telemetry.metadata`. No change needed.
- [x] End-to-end contract test in `packages/platform/ai-latitude/src/index.test.ts`: a real `runWithAiTelemetry` call (with a stub `execute` fn — no network, no AI provider) routed through `LatitudeSpanProcessor` → `InMemorySpanExporter`, asserting the exported span's `latitude.metadata` JSON contains the passed metadata. Covers `scoreId` but the contract is generic: any metadata key must survive the full chain. Guards against future regressions in `capture()`, the processor, or OTel SDK bumps.

Checkpoint:

- [x] `pnpm --filter @domain/annotation-queues test` → 141/141 green (includes new contract tests for `systemQueueAnnotateInputSchema.scoreId` and updated `runSystemQueueAnnotatorUseCase` telemetry metadata assertions).
- [x] `pnpm --filter @app/workflows test` → 51/51 green (workflow test now asserts `scoreId` flows from `draftAnnotate` output into `persistAnnotation` input).
- [x] `pnpm --filter @platform/ai-latitude test` → 4/4 green (new e2e contract test).
- [x] `pnpm --filter @domain/annotations test` → still green (phase 1 + enrichment untouched).
- [x] All three packages typecheck and Biome-lint clean.
- [x] No user-visible behavior change (the LLM span now carries `scoreId` but nothing observes it yet; that wire-up lands in Phase 4).

### Phase 3 — OpenAPI emission and Fern SDK

Scope:

- [ ] Add `apps/api/scripts/emit-openapi.ts` that writes `apps/api/openapi.json`.
- [ ] Wire `pnpm --filter @apps/api openapi:emit` script.
- [ ] One-time sweep of `apps/api/src/routes/*.ts` adding stable `operationId` values and `description` fields on response schemas.
- [ ] Add `fern/` at repo root with `generators.yml` and `fern.config.json`. Scaffold the Python generator but don't wire it.
- [ ] Create `packages/sdk/typescript/package.json` (`@latitude-data/sdk` at `6.0.0-alpha.0`), `tsup.config.ts`, `tsconfig.json`.
- [ ] Add hand-written `packages/sdk/typescript/src/index.ts` re-exporting the generated client under `src/generated/`.
- [ ] Root `package.json` scripts: `sdk:emit-openapi`, `sdk:generate`, `sdk:check`.
- [ ] CI drift check step in `.github/workflows/check.yml` that runs `sdk:generate` and fails if the working tree is dirty.
- [ ] New `.github/workflows/publish-typescript-sdk.yml` mirroring `publish-typescript-telemetry.yml`.

Checkpoint:

- [ ] `pnpm sdk:generate` produces a clean tree.
- [ ] `pnpm --filter @latitude-data/sdk build` green.
- [ ] `pnpm --filter @latitude-data/sdk typecheck` green.
- [ ] `pnpm --filter @latitude-data/sdk check` green.
- [ ] `pnpm --filter @latitude-data/sdk test` green.
- [ ] Publish workflow is *configured* but not yet exercised — first publish happens on the first merge to `main` that touches the package.

### Phase 4 — Domain, platform, and worker

Scope:

- [ ] New package `@domain/product-feedback` with port `ProductFeedbackClient.writeAnnotation(...)`.
- [ ] Use case `recordSystemAnnotatorReviewUseCase` with unit tests.
- [ ] Use case `recordEnrichmentReviewUseCase` with unit tests.
- [ ] Contracts and tagged errors for `@domain/product-feedback`.
- [ ] New package `@platform/latitude-api` with `createLatitudeApiClient({ apiKey, projectSlug, baseUrl? })` setup-client pattern matching other platform adapters.
- [ ] `ProductFeedbackClient` adapter wrapping `@latitude-data/sdk` with retry/logging defaults.
- [ ] Adapter tests using Fern's custom-fetcher option to assert request shape.
- [ ] New BullMQ `product-feedback` queue in `apps/workers`.
- [ ] Worker consuming `product-feedback:submit-system-annotator-review` delegating to domain use case.
- [ ] Worker consuming `product-feedback:submit-enrichment-review` delegating to domain use case.
- [ ] Worker tests for both job types.

Checkpoint:

- [ ] `pnpm --filter @domain/product-feedback test` green.
- [ ] `pnpm --filter @platform/latitude-api test` green.
- [ ] `pnpm --filter @apps/workers test` green.
- [ ] Workers boot cleanly locally.

### Phase 5 — API route and web UI

Scope:

- [ ] Add internal (session-auth) `POST /annotations/:annotationId/product-feedback/system-annotator` route in `apps/api`. Validates, enqueues the BullMQ job, returns `202 Accepted`.
- [ ] Add internal (session-auth) `POST /scores/:scoreId/product-feedback/enrichment` route in `apps/api`. Validates, enqueues the BullMQ job, returns `202 Accepted`.
- [ ] New web collection mutations for the two submissions in `apps/web/src/domains/annotations/annotations.collection.ts`.
- [ ] Update `AnnotationApprovalButtons` in `apps/web/src/routes/_authenticated/projects/$projectSlug/-components/annotations/annotation-card.tsx:39` to add the post-decision popover with Approve-optional / Reject-required textarea and the copy defined in Flow 1.
- [ ] Update the enrichment popover in the same file with 👍/👎 and the Bad-required textarea with the copy defined in Flow 2.

Checkpoint — manual dev-server walkthrough:

- [ ] Approve with no comment: decision fires, popover shows, Skip closes with no enqueue logged; Submit with empty textarea is allowed and enqueues.
- [ ] Approve with a comment: decision fires, popover shows, Submit with text enqueues.
- [ ] Reject without a comment: decision fires, popover shows, Submit is disabled.
- [ ] Reject with a comment: decision fires, popover shows, Submit enqueues.
- [ ] Enrichment 👍: one click fires and enqueues with no textarea.
- [ ] Enrichment 👎: textarea required, Submit enqueues with reason.
- [ ] Server logs confirm the BullMQ job is enqueued and consumed for every scenario above.
- [ ] Scores appear in the Latitude dogfood project when running against a configured tenant.

### Out of plan — infra provisioning

Provisioning the Latitude dogfood project (organization + project + API key) and pointing `LATITUDE_API_KEY` / `LATITUDE_PROJECT_SLUG` at it in the relevant deployment happens outside the codebase — once per environment — and is not part of any phase above.

### Constraint on npm publishing

I cannot publish `@latitude-data/sdk@6.0.0-alpha.0` myself — that requires `NPM_TOKEN`. Phase 3 prepares the workflow; the first successful publish happens when the workflow runs on a `main` merge that changes `packages/sdk/typescript/package.json`. Do a CI workflow to publish the version check as example telemetry package github workflow.

## Open questions

None blocking. All previously-open items are resolved:

- **Span drop paths**: verified none exist today; documented inline under **Identity strategy → Why the filter lookup is safe** and covered by an end-to-end regression test.
- **Use-case name**: settled on `submitApiAnnotationUseCase`.
- **Env reuse**: we accept the coupling between telemetry destination and product-feedback destination via `LATITUDE_API_KEY` / `LATITUDE_PROJECT_SLUG`.
- **Popover copy**: concrete strings included in Flow 1 and Flow 2.
