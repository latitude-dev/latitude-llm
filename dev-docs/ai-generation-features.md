# AI generation features

Catalog of `AI.generate` usage: purpose, telemetry tags, metadata, and call sites. Embedding and rerank (`AI.embed`, `AI.rerank`) are out of scope — the Voyage adapter does not wrap them in `capture`, so they are never exported to Latitude.

Tag constants: `packages/domain/ai/src/ai-generate-telemetry.ts`. Evaluation-specific capture helpers: `packages/domain/evaluations/src/runtime/ai-telemetry.ts`.

## Dogfood project routing

Each feature is dogfooded into its own Latitude project (one project per AI feature, not one project with tags). The capture's `project` option is set to the matching slug from `LATITUDE_TELEMETRY_PROJECT_SLUGS` (`packages/domain/shared/src/telemetry-projects.ts`); the seed (`@domain/shared/seeding`) creates the same set in the dogfood org. Auth is org-scoped, so a single API key reaches every project — there is no project-slug env var.

| Feature | Project slug |
| --- | --- |
| Signal Discovery Details | `latitude-signal-discovery` |
| Annotation Enrichment | `latitude-annotation-enrichment` |
| Flagger Instruction Extraction / Classification / Drafting | `latitude-flaggers` |
| Evaluation Judge (live / alignment / optimization) | `latitude-evaluations` |
| Signal Generation | `latitude-signal-generation` |
| Optimization Proposal (GEPA) | `latitude-optimizations` |
| Taxonomy Naming (propose themes / name cluster) | `latitude-taxonomy` |
| Conversation Intelligence Moment Classification | `latitude-conversation-intelligence` |

## Knowing which trace a generation landed in

`GenerateResult.telemetryTraceId` carries the Latitude trace a captured generation was exported into, so a feature can store the way back from its output to the decision behind it. `runWithAiTelemetry` (`@platform/ai-latitude`) reads it inside the `capture` callback and hands it to the adapter's execute function; reading it after the effect returns would pick up the host's own Datadog trace instead, since the capture span has already ended.

Two absences are deliberate, not gaps: an uncaptured call (no `telemetry` option) has no Latitude trace, and the value is **excluded from the AI cache** (`withAICache`) because a cache hit creates no span — a persisted id would name whichever caller first produced that generation.

Today one feature stores it: flagger classifications keep it as `metadata.flaggerTraceId` on the annotation score, which is what lets a customer's verdict on a signal be written back onto Latitude's own flagger trace in `latitude-flaggers` (`recordSignalFlaggerReviewUseCase`, in-process against the dogfood organization). See [`./flaggers.md`](./flaggers.md#grading-a-flaggers-own-decisions).

## Issues

> **Signal Discovery Details**
> Generates a stable issue title and description from recent occurrences (or from supplied occurrence text before an issue row exists).
> **Tags:** `issue:details`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "issueId": "789", // optional
>   "occurrenceCount": 10 // optional; number of occurrences clustered for this generation
> }
> ```
>
> **Called from:**
>
> - `packages/domain/issues/src/use-cases/generate-signal-details.ts`
> - `packages/domain/issues/src/use-cases/create-signal-from-score.ts`
> - `packages/domain/issues/src/use-cases/refresh-signal-details.ts`

## Annotations

> **Annotation Enrichment**
> Turns raw publication feedback plus optional trace context into a single clusterable sentence before the score is published.
> **Tags:** `annotation:enrichment`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "scoreId": "",
>   "traceId": "abc" // optional; omitted when the annotation has no trace
> }
> ```
>
> Optional `sessionId` on the telemetry capture object (sibling of `metadata`), when a session is resolved from the trace.
> **Called from:**
>
> - `packages/domain/annotations/src/use-cases/enrich-annotation-for-publication.ts`
> - `apps/workflows/src/activities/annotation-publication-activities.ts`

## Flaggers

> **Flagger Instruction Extraction**
> Summarizes the flagged agent's system prompt into a bounded instruction set before classification, so the classifier judges behavior against the agent's actual instructions. Cached per (org, system prompt) hash; falls back to a truncated prompt rendering on failure.
> **Tags:** `flagger:extract-instructions`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "traceId": "",
>   "flaggerSlug": "jailbreaking",
>   "stage": "instruction-extraction"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/flaggers/src/use-cases/run-flagger.ts`
> - `apps/workflows/src/activities/flagger-activities.ts`

> **Flagger Classification**
> Classifies whether a trace matches a flagger strategy (e.g. jailbreaking), then runs an annotation-review pass on a match.
> **Tags:** `flagger:classify` (`flagger:no-reflag` appended when the trace being flagged is itself flagger-generated)
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "traceId": "",
>   "flaggerSlug": "jailbreaking",
>   "stage": "annotation-review" // optional; only on the review-stage call
> }
> ```
>
> **Called from:**
>
> - `packages/domain/flaggers/src/use-cases/run-flagger.ts`
> - `apps/workflows/src/activities/flagger-activities.ts`

> **Flagger Drafting**
> Drafts review-ready feedback text after a flagger has matched a trace.
> **Tags:** `flagger:draft` (`flagger:no-reflag` appended for flagger-generated traces)
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "traceId": "",
>   "flaggerSlug": "jailbreaking"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/flaggers/src/use-cases/run-flagger-annotator.ts`
> - `apps/workflows/src/activities/flagger-activities.ts`

## Evaluations

> **Evaluation Judge (Live)**
> Runs the current persisted evaluation script on real production traces when a live evaluation executes.
> **Tags:** `eval:execute`, `live`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "evaluationId": "",
>   "issueId": "",
>   "traceId": ""
> }
> ```
>
> **Called from:**
>
> - `packages/domain/evaluations/src/use-cases/live/run-live-evaluation.ts`
> - `packages/domain/evaluations/src/use-cases/live/execute-live-evaluation.ts`
> - `apps/workers/src/workers/live-evaluations.ts`

> **Evaluation Judge (Alignment)**
> Runs the script on curated positive/negative examples to refresh alignment metrics (confusion matrix and derived scores).
> **Tags:** `eval:execute`, `alignment`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "issueId": "",
>   "evaluationId": null, // optional; null during initial generation
>   "traceId": "", // example trace
>   "exampleLabel": "positive", // or "negative"
>   "jobId": "job-1" // optional; omitted when empty
> }
> ```
>
> **Called from:**
>
> - `packages/domain/evaluations/src/use-cases/alignment/evaluate-draft-against-examples.ts`
> - `packages/domain/evaluations/src/use-cases/alignment/evaluate-baseline-draft.ts`
> - `packages/domain/evaluations/src/use-cases/alignment/evaluate-incremental-draft.ts`
> - `apps/workflows/src/activities/evaluation-alignment-activities.ts`

> **Evaluation Judge (Optimization)**
> Runs candidate evaluation scripts on examples inside the GEPA loop to score proposals.
> **Tags:** `eval:execute`, `optimization`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "issueId": "",
>   "evaluationId": null, // optional; null during initial generation
>   "candidateHash": "",
>   "exampleTraceId": "",
>   "jobId": "job-1" // optional; omitted when empty
> }
> ```
>
> **Called from:**
>
> - `packages/domain/evaluations/src/use-cases/optimization/evaluate-optimization-candidate.ts`
> - `apps/workflows/src/activities/evaluation-optimization-activities.ts`

> **Signal Generation**
> Drafts a complete signal (name, description, filters, sampling, and a rule/judge/script evaluation) from a freeform user description, grounded in observed project data (distinct filter-dimension values, tool names, traffic, one sample session). Each draft is schema-mapped, compile-checked, and previewed against recent sessions; failures feed a repair turn and one verdict-review turn lets the model confirm or revise (up to 4 generate calls) before the signal is created. Model resolves under feature `SIGNAL_GENERATOR`.
> **Tags:** `signal:generation`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": ""
> }
> ```
>
> **Called from:**
>
> - `packages/domain/signals/src/use-cases/create-signal-from-prompt.ts`

## Conversation intelligence

> **Moment Classification**
> Validates embedding-anchor moment candidates against one normalized session transcript. The model returns only the accepted compact candidate IDs; it cannot create, relabel, or alter persisted moment fields. Model resolves under feature `MOMENT_CLASSIFIER`.
> **Tags:** `conversation-intelligence:moment-classifier`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "sessionId": "",
>   "candidateCount": 3,
>   "nominatedCandidateCount": 5
> }
> ```
>
> **Called from:**
>
> - `packages/domain/conversation-intelligence/src/use-cases/analyze-session.ts`

## GEPA / optimization

> **Optimization Proposal**
> Proposes the next candidate evaluation script from trajectories during GEPA search.
> **Tags:** `gepa:propose`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "issueId": "",
>   "evaluationId": null, // optional; null during initial generation
>   "evaluationHash": "",
>   "candidateHash": "",
>   "jobId": "job-1" // optional; omitted when empty
> }
> ```
>
> **Called from:**
>
> - `apps/workflows/src/activities/evaluation-optimization-activities.ts` (`proposeOptimizationCandidate`)

## Taxonomy

Two LLM calls name a taxonomy cluster; both route to `latitude-taxonomy`. The behavior-summary embedding (`embed-behavior-summary.ts`) is an `AI.embed` call and is intentionally not captured.

> **Propose Themes**
> Proposes concise candidate conversation topic themes for a cluster from sampled member summaries (or child topics).
> **Tags:** `taxonomy:propose-themes`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "clusterId": "",
>   "mode": "" // "leaf" | "interior" | "root"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/taxonomy/src/use-cases/name-taxonomy.ts` (`generateClusterName`)

> **Facet Extraction**
> Compiles a facet's free-text `instructions` into a controlled prompt (system-owned guardrails the facet cannot override: one sentence, untrusted transcript, no PII, English, explicit "unclear", bounded length) and extracts a one-sentence answer per sampled session for a custom behavior. Answers are embedded (`AI.embed`, not captured) and cached in `taxonomy_facet_projections` keyed `(facetId, sessionObservationId)`. Model resolves under feature `FACET_EXTRACTION` (default Bedrock `minimax.minimax-m2.5`).
> **Tags:** `taxonomy:facet-extract`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "facetId": "",
>   "sessionObservationId": ""
> }
> ```
>
> **Called from:**
>
> - `packages/domain/taxonomy/src/use-cases/extract-facet-projections.ts` (`extractFacetProjectionsUseCase`)

> **Name Cluster**
> Collapses the candidate themes into one cluster topic name (2–5 words) and a one-sentence description.
> **Tags:** `taxonomy:name-cluster`
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "clusterId": "",
>   "mode": "" // "leaf" | "interior" | "root"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/taxonomy/src/use-cases/name-taxonomy.ts` (`generateClusterName`)
