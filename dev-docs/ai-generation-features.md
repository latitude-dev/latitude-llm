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
| Optimization Proposal (GEPA) | `latitude-optimizations` |
| Taxonomy Naming (propose themes / name cluster) | `latitude-taxonomy` |

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

