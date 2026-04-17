# AI generation features

Catalog of `AI.generate` usage: purpose, telemetry tags, metadata, and call sites. Embedding and rerank (`AI.embed`, `AI.rerank`) are out of scope.

Tag constants: `packages/domain/ai/src/ai-generate-telemetry.ts`. Evaluation-specific capture helpers: `packages/domain/evaluations/src/runtime/ai-telemetry.ts`.

## Issues

> **Issue Discovery Details**  
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
> - `packages/domain/issues/src/use-cases/generate-issue-details.ts`
> - `packages/domain/issues/src/use-cases/create-issue-from-score.ts`
> - `packages/domain/issues/src/use-cases/refresh-issue-details.ts`

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

## System queues

> **System Queue Classification**  
> Decides whether a trace belongs in an LLM-backed system annotation queue from a bounded trace summary.  
> **Tags:** `system-queue:classify`  
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "traceId": "",
>   "queueSlug": "jailbreaking"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/annotation-queues/src/use-cases/run-system-queue-flagger.ts`
> - `apps/workflows/src/activities/flagger-activities.ts`

> **System Queue Drafting**  
> Drafts review-ready feedback text after the trace is already matched to a system queue.  
> **Tags:** `system-queue:draft`  
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "traceId": "",
>   "queueSlug": "jailbreaking"
> }
> ```
>
> **Called from:**
>
> - `packages/domain/annotation-queues/src/use-cases/run-system-queue-annotator.ts`
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

> **Optimization Summary**  
> Produces the evaluation display name and description from the optimized script and issue context.  
> **Tags:** `gepa:summary`  
> **Metadata:**
>
> ```json
> {
>   "organizationId": "",
>   "projectId": "",
>   "issueId": "",
>   "evaluationId": null, // optional; null during initial generation
>   "evaluationHash": "",
>   "jobId": "job-1" // optional; omitted when empty
> }
> ```
>
> **Called from:**
>
> - `apps/workflows/src/activities/evaluation-alignment-activities.ts` (`generateEvaluationDetails`)

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

