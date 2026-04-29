# Annotation Queues

Annotation queues remain a persisted data model for managed human-review workflows over traces, but they are not the runtime surface for flaggers.

Queue concepts:

- a queue is conceptually `manual` when it has no filter configured and membership is created by explicit insertion rather than stored filter materialization
- a queue is conceptually `live` when it has a filter configured and is populated incrementally over time from that filter plus optional sampling
- the filter field reuses the shared `FilterSet` described in `./filters.md`, applied against the shared trace field registry also used by evaluation triggers

The web app no longer exposes annotation queue routes, forms, trace bulk-add actions, or queue-review detail screens. Existing queue tables and rows stay in place until a later data-model cleanup.

## Flaggers

Flaggers live in `@domain/flaggers`, not in `@domain/annotation-queues`. A flagger is a per-project configuration row for one registered strategy slug.

Important invariants:

- every project is provisioned with one flagger row per registered strategy slug
- `(organizationId, projectId, slug)` is unique
- `slug` is typed as the `FlaggerSlug` union from the strategy registry in both the domain entity and Drizzle schema
- `enabled` gates both deterministic matches and LLM workflow enqueueing
- `sampling` is an integer in `[0, 100]` and only affects the LLM-capable `no-match` path

Provisioning flow:

- `createProjectUseCase` emits `ProjectCreated`
- the domain-events worker enqueues `projects:provision`
- the projects worker calls `provisionFlaggersUseCase`
- the Postgres repository inserts rows idempotently with `ON CONFLICT (organization_id, project_id, slug) DO NOTHING`

The project settings page lists provisioned flaggers and uses TanStack DB optimistic collection updates to toggle `enabled`. The UI only manages flaggers; it does not expose annotation queues.

## Trace Routing

Trace-end enqueues a single `deterministic-flaggers:run` job per trace. That worker loads the trace once, loads the project flaggers once, and runs the registered strategies in two phases so `suppressedBy` dependencies are honored.

Per-strategy outcomes:

- `matched`: writes a published annotation score immediately with `source = "annotation"`, `sourceId = "SYSTEM"`, `draftedAt = null`, `annotatorId = null`, and strategy-supplied feedback; issue discovery receives the normal `ScoreCreated` fan-out
- `no-match`: LLM-capable strategies apply the provisioned flagger's `sampling`; sampled-in traces enqueue `start-flagger-workflow` with reason `sampled`
- `ambiguous`: LLM-capable strategies check the per-org/slug Redis rate limit; traces under the limit enqueue `start-flagger-workflow` with reason `ambiguous`
- `suppressed`: phase-2 strategies skip work when a listed phase-1 suppressor matched
- `dropped`: records disabled, missing flagger, sampled-out, rate-limited, missing-context, or no-LLM-capability decisions
- `failed`: records strategy-local failures without failing the whole fan-out

Redis keys that are organization-scoped use the repository-wide prefix convention, for example `org:{organizationId}:ratelimit:flagger-ambiguous:{flaggerSlug}`.

## LLM Flagger Workflow

The Temporal workflow is LLM-only. It runs only after deterministic routing selected a sampled or ambiguous LLM-capable strategy.

Workflow shape:

- `runFlagger`: loads trace context, resolves the strategy by `flaggerSlug`, builds flagger-specific prompts, and returns whether the trace matched
- `draftAnnotate`: generates the annotation feedback and forwards trace context including `sessionId` and `simulationId`
- `saveAnnotation`: writes one published annotation score with `source = "annotation"`, `sourceId = "SYSTEM"`, `draftedAt = null`, and the forwarded session/simulation context

The workflow does not create queue items, queue drafts, or annotation queue counters. Flagger outputs skip human draft review and enter issue discovery as normal published annotation scores.

## Strategy Registry

`packages/domain/flaggers/src/flagger-strategies/` is the source of truth for strategy slugs and strategy behavior.

Each strategy can provide:

- `hasRequiredContext(trace)`
- `detectDeterministically(trace)` returning `matched`, `no-match`, or `ambiguous`
- `buildSystemPrompt(trace)` and `buildPrompt(trace)` for LLM-capable strategies
- `annotator` copy for LLM-generated feedback
- `details` display copy for deterministic-only strategies
- `suppressedBy` dependencies

Current strategy slugs:

- `jailbreaking`
- `nsfw`
- `trashing`
- `refusal`
- `laziness`
- `frustration`
- `forgetting`
- `tool-call-errors`
- `output-schema-validation`
- `empty-response`

`refusal` is suppressed by `jailbreaking` and `nsfw`. `laziness` is suppressed by `trashing`. Only `matched` decisions suppress later strategies.
