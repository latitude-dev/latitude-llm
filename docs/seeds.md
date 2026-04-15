# Seeds

The default development seed creates one coherent project rather than a bag of unrelated demo fixtures.

Seed data should explain how the product works:

- ambient telemetry shows realistic day-to-day project traffic
- deterministic traces back the workflows that need stable drilldowns
- annotations, issues, evaluations, datasets, simulations, and queues describe connected lifecycles inside the same seeded organization and project

The default seed world is **Acme Inc.**, a company that uses AI across customer support, operations, and internal tooling. The product names and conversations carry the theme, but the observability structure should still look like a real production project.

## Seed Principles

- **Coherence over isolated demos**. Prefer one believable project graph where data models connect to each other. Avoid adding standalone records that only exist to light up one screen when the same UI state can be represented inside the main narrative.
- **Realism first, humor second**. Acme conversations can be funny, but spans, sessions, costs, models, metadata, and state transitions should still feel like real observability data.
- **Ambient plus deterministic layers**. The seed combines broad generated telemetry for browsing and analytics with a smaller deterministic trace layer for workflows that require stable links.
- **Cross-store integrity**. When Postgres, ClickHouse, and Weaviate all participate in a workflow, the seeded entities should describe the same organization, project, issue family, and lifecycle state.
- **Extend the story before inventing a new one**. New seeds should usually deepen the existing Acme support project or one of its agents before introducing a disconnected scenario.

The workflow that matters most is:

`trace -> annotation -> issue -> evaluation -> dataset -> simulation`

Not every seeded issue needs to reach the final step, but any intentional stop in the chain should be deliberate and documented.

## Seed World

The default seed creates one Acme organization, one default project, a small set of users and memberships, and one default API key. Most workflow-specific seed data belongs to the Acme support project under that single tenant boundary.

The seeded AI agents have different roles:

- **Acme Assist** is the central customer-support agent and owns the fixed issue, evaluation, dataset, and simulation lifecycles.
- **Order Router** provides fulfillment-oriented tool-call and multi-step telemetry.
- **Product Copywriter** provides simple completion traffic.
- **Safety Incident Reviewer** provides RAG and nested-LLM traces.
- **QA Complaint Classifier** provides error-heavy classification traffic.
- **Internal Knowledge Assistant** provides internal RAG traffic.

Only some of these agents participate in the deterministic reliability graph. The rest primarily exist to make the project's telemetry and analytics feel like a real multi-agent system.

## Coverage Goals

The default seed should support these development needs:

- a developer can sign in immediately and has a usable organization, project, memberships, and API key
- the traces list and analytics surfaces have enough realistic telemetry variety to exercise pagination, filters, sessions, models, tags, metadata, and error rendering
- all major trace shapes that the product renders are present in the ambient telemetry
- issue, evaluation, dataset, simulation, score, and queue UIs are backed by connected data instead of disconnected samples
- at least two issue families show a mature end-to-end lifecycle, while at least one issue remains intentionally generate-ready for evaluation creation workflows
- any score, queue item, or simulation drilldown that links to a trace or span resolves to a real deterministic ClickHouse record
- Postgres owns canonical lifecycle state, ClickHouse owns telemetry and analytics mirrors, and Weaviate owns the issue search projection

## Implementation Layout

### Shared narrative and IDs

The shared seed package is the source of truth for cross-store identity and reusable content:

- `packages/domain/shared/src/seeds.ts` defines stable IDs, UUIDs, queue IDs, simulation IDs, and deterministic trace/span ID ranges
- `packages/domain/shared/src/seed-content/index.ts` exports the themed content pools used by all seeders
- `packages/domain/shared/src/seed-content/agents.ts`, `models.ts`, `prompts.ts`, `tools.ts`, `topics.ts`, and `users.ts` feed the generated ambient telemetry
- `packages/domain/shared/src/seed-content/annotation-traces.ts`, `alignment-fixtures.ts`, and `datasets.ts` define the deterministic workflow content
- seeders should import that seed-only surface through `@domain/shared/seeding`; the main `@domain/shared` entrypoint stays runtime-safe for non-seeding code

When a seeded concept needs to exist in more than one store, start in `@domain/shared` first.

### Postgres

Postgres is the canonical structured lifecycle layer. Its seed assembly lives in `packages/platform/db-postgres/src/seeds/all.ts` and runs in this order:

1. organizations, users, and memberships
2. projects
3. API keys
4. datasets and dataset versions
5. issues
6. evaluations
7. simulations
8. scores
9. annotation queues and queue items

Use Postgres seeds to define the canonical workflow graph and lifecycle state that the UI edits, filters, and navigates.

### ClickHouse

ClickHouse is split into two responsibilities:

- **ambient telemetry** generated by `packages/platform/db-clickhouse/src/seeds/spans/generator.ts` and its helper modules
- **deterministic telemetry** inserted by `packages/platform/db-clickhouse/src/seeds/spans/fixed-traces.ts`

`packages/platform/db-clickhouse/src/seeds/spans/index.ts` combines those two span layers. `packages/platform/db-clickhouse/src/seeds/all.ts` then adds:

- the ClickHouse score mirror
- dataset row storage for seeded datasets

Use ClickHouse when a workflow needs real trace/span content, analytics joins, simulation trace tabs, or dataset row browsing.

### Weaviate

Weaviate seeds live in `packages/platform/db-weaviate/src/seeds/all.ts` and currently project issues only.

Use Weaviate when an issue needs its searchable tenant-scoped document and UUID projection to stay aligned with the canonical Postgres issue row.

## Default Seed Graph

### Foundations

The default seed creates:

- one Acme organization
- one default project
- an owner, an admin, and additional members used by assignment-heavy UIs
- one default API key that seeded telemetry references

This foundation is intentionally simple so the more interesting seed complexity can live in the reliability workflows.

### Ambient telemetry

The project includes a large generated telemetry layer spread across roughly 30 days of activity.

That layer exists to make the product feel alive:

- multiple services and tags
- multiple models and providers
- realistic session behavior
- multiple trace patterns, including simple chat, tool calls, RAG, multi-step agents, complex nested traces, and errors
- realistic token, cost, and metadata variation

Most traces in the project belong to this ambient layer.

### Deterministic workflow core

The seed also includes a deterministic Acme support workflow core built from fixed traces and canonical linked records.

The issue graph is intentionally broader than one happy-path lifecycle. The default seed should cover at least twenty-five issues in one coherent tenant-scoped project graph:

| Issue family | Narrative role | Lifecycle coverage |
| --- | --- | --- |
| Warranty coverage fabrication | Mature support issue | Active, escalating, evaluation-linked, dataset-backed, simulation-backed |
| Dangerous product combinations | Mature issue with regression | Resolved issue that regressed through fresh linked occurrences and still has an active monitor |
| Unsupported logistics guarantees | Generate-ready support issue | New, escalating, annotation-backed only, no linked evaluation yet |
| Instant returns eligibility | Resolved issue with continued monitoring | Historical evaluation-linked issue whose monitor remains active after resolution to catch regressions |
| Courtesy credits and fee waivers | Ignored noisy issue | Custom-score-backed issue with recent ignored state and no linked evaluation |
| Account recovery verification bypass | Active issue outside the original support-policy cluster | Evaluation-linked security issue with fresh recent activity |
| Installation certification fabrication | Older lingering issue | Custom-score-backed issue with older occurrences across the rolling seed window |
| Additional long-tail reliability issues | Diverse backlog coverage | Custom-score-backed issues spanning support, logistics, compliance, billing, procurement, and API operations; some remain intentionally denoised below the visibility threshold while others exceed it |

Important rules:

- annotation evidence comes from deterministic fixed traces with real conversation content
- positive annotation scores link to their issue when the issue already exists
- negative examples remain part of the same story and act as counter-examples rather than unrelated filler
- some issues intentionally stop before evaluation creation so that issue-to-evaluation workflows still have real seed targets
- some issues are evaluation-linked and some are custom-score-backed only so the issue UI can exercise both linked-evaluation and no-linked-evaluation states
- the issue timeline should span roughly the last three months relative to when the seed runs, not a fixed historical week
- the default issue list should include both visible and intentionally denoised issues so the repository can exercise `MIN_OCCURRENCES_FOR_VISIBILITY` behavior

### Alignment, datasets, and simulations

The mature issue families continue downstream into evaluation quality and regression testing:

- warranty coverage fabrication has its own guardrail dataset and passed simulation
- dangerous product combinations has its own guardrail dataset and passed simulation
- dangerous combinations also has the richest dedicated alignment-fixture corpus for nuanced evaluator tuning
- an additional errored logistics simulation exists to cover the simulation error path without pretending the third issue is already mature

The seed should favor realistic control cases inside datasets and simulations instead of teaching blanket refusal behavior. A mature guardrail dataset should usually contain both failures and legitimate allowed cases when the real workflow requires that nuance.

### Scores and queues

Scores and annotation queues are part of the same graph rather than separate demos.

The default seed includes:

- canonical Postgres scores for lifecycle coverage, issue-linked annotations, alignment material, simulation-linked evaluation results, and additional issue-linked evaluation/custom occurrences
- a ClickHouse score mirror for analytics using the same rolling timestamps as Postgres
- manual annotation queues for the three deterministic annotation issue families
- one system queue and one live queue for queue-type coverage

Queue items and trace-linked scores should point to deterministic traces, not to random generated telemetry.

Issue state coverage depends on score timing, not only issue timestamps. The rolling seed window should preserve enough recent occurrences to keep these UI states populated:

- `new` through fresh logistics annotation evidence
- `escalating` through issues whose last-day occurrence count exceeds their previous seven-day baseline
- `resolved` through an issue with no occurrences since its resolution point
- `regressed` through a resolved issue that later receives new occurrences
- `ignored` through a manually ignored issue that still keeps its canonical occurrence history
- issue denoising through extra custom-score-backed issue families where some have only one or two canonical occurrences while others have three or more

### Deterministic trace layer

The deterministic ClickHouse layer is the backbone of workflow integrity. It exists so that:

- score-to-trace navigation always resolves
- queue item drilldowns always resolve
- alignment and issue workflows have stable source conversations
- simulation trace tabs always show real data

If a seeded workflow depends on opening a specific trace or span from another model, that workflow should usually be backed by deterministic traces rather than by remapped or randomly generated telemetry.

## Extending Seeds

### 1. Start from the workflow, not the table

When adding seeds, begin with the product behavior you want to support:

- a new trace pattern
- a new issue family
- a new evaluation lifecycle
- a new queue behavior
- a new dataset or simulation

Then decide which stores need to participate in that workflow.

### 2. Choose ambient or deterministic

Use the ambient generator when the goal is broad project realism:

- more telemetry volume
- more filter variety
- more service/model/tag coverage
- more realistic sessions or errors

Use deterministic seeds when the goal is stable workflow navigation:

- annotations
- issues
- evaluation source material
- queue items
- dataset-backed simulation traces
- lifecycle drilldowns that must always resolve

### 3. Add shared identity and reusable content first

When a new seeded concept crosses module or store boundaries:

1. add or update stable IDs in `packages/domain/shared/src/seeds.ts`
2. place reusable narrative content in `packages/domain/shared/src/seed-content/*`
3. wire Postgres, ClickHouse, and Weaviate seeders to those shared definitions

Do not scatter hardcoded IDs or story text independently across seeders.

### 4. Treat Postgres as the canonical lifecycle

If a concept has user-facing state, ownership, or workflow transitions, model it in Postgres first.

That usually means:

- issues
- evaluations
- simulations
- scores
- annotation queues
- dataset/version metadata

Then add the supporting ClickHouse or Weaviate data required to make the workflow complete.

### 5. Preserve cross-store link integrity

When adding or changing trace-linked workflow data:

- any score or queue item with a `traceId` or `spanId` should resolve to a real ClickHouse trace/span
- any passed simulation should reference a real dataset and real evaluation IDs
- any issue that exists in Weaviate should describe the same issue family, UUID, organization, and project as Postgres
- any dataset row counts and simulation metadata should remain consistent with the seeded dataset content
- any issue-state example that relies on escalation, resolution, or regression should be backed by score occurrence timing that still produces that state against the rolling `now()` window used by analytics

### 6. Prefer coherent additions over UI-only states

If a new screen needs a state that the current graph does not show, first try to represent that state inside the existing Acme story.

For example:

- prefer a new queue item inside an issue-driven queue over a generic demo queue
- prefer a new trace family inside an existing agent or seeded workflow over a completely unrelated one-off scenario
- prefer a new control case inside a real guardrail dataset over a synthetic dataset built only for one widget

Standalone demo-only records are a last resort.

## Maintenance Rule

`docs/seeds.md` is the durable guide for how the default seed should be understood and extended.

If the seeded narrative, ownership boundaries, lifecycle graph, or extension rules change, update this file along with the implementation so future seed work continues to follow the same coherent model.
