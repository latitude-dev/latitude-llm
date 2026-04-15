# `@tools/seeds`

Utility package for development-only seeding workflows that are easier to express as scripts than as database seed rows.

The database seeds still live in the regular DB packages. This package is for programmatic seed flows that talk to running services, especially the ingest pipeline.

## What This Package Does

Today this package contains one main tool:

- `seed:live-monitor`: sends realistic OTLP traces to the ingest service using the default seeded organization, project, and API key

This is useful when you want to test the full live-monitoring path end to end:

- ingest receives spans
- `SpanIngested` is emitted
- trace-end debounce finishes
- `TraceEnded` fans out
- live evaluations enqueue and execute
- live annotation queues curate traces
- system annotation queues fan out to workflows

The script is intentionally more than a simple fixture replayer:

- it uses the seeded org/project credentials
- it auto-provisions the full default system queue set by default
- it picks `traceId`s that sample in or out as required by each fixture
- it sends different traces concurrently
- it preserves a realistic timeline within each trace

## Seeded Identity Used By The Script

The script uses the existing default seed data:

- organization: `Acme Inc.`
- organization slug: `acme`
- project: `Default Project`
- project slug: `default-project`
- API key token: `lat_seed_default_api_key_token`

You do not need to create separate test credentials for this tool.

## Prerequisites

Before running the script, make sure:

1. Your local database and caches are up.
2. You have applied the normal DB seeds.
3. These services are running:
  - `apps/ingest`
  - `apps/workers`
  - `apps/workflows`

Example startup:

```bash
cd /Users/sans/src/latitude-v2/apps/ingest
pnpm dev
```

```bash
cd /Users/sans/src/latitude-v2/apps/workers
pnpm dev
```

```bash
cd /Users/sans/src/latitude-v2/apps/workflows
pnpm dev
```

## Usage

Run from the package directory:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --help
```

List all fixtures:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --list-fixtures
```

Run all fixtures:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor
```

Run a subset:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --fixtures warranty-eval-in,combination-eval-and-live-queue-in,tool-call-error
```

Use a custom ingest URL:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --ingest-url http://127.0.0.1:3002
```

Speed up the within-trace timing:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --time-scale 0.5
```

Skip system queue provisioning:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --no-provision-system-queues
```

## CLI Options

- `--fixtures <a,b,c>`: comma-separated fixture keys to send
- `--ingest-url <url>`: base URL for the ingest service
- `--time-scale <n>`: multiplies fixture delays by the given factor
- `--no-provision-system-queues`: skips provisioning the default system queues before sending traces
- `--list-fixtures`: prints the available fixture keys and exits
- `--help`: prints help

## Fixture Catalog

Each fixture represents one trace scenario. Some are meant to trigger live evaluations, some are meant to skip them, some are for live annotation queue curation, and some are for system queue fan-out.


| Key                                  | Description                                                                                                                 | Intended outcome                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `warranty-eval-in`                   | Support trace that should execute only the seeded warranty monitor while staying below the live high-cost queue threshold.  | Runs the seeded warranty live evaluation only.                                         |
| `support-evals-out`                  | Support trace that still matches the seeded service filter but should sample out of all seeded live evaluations.            | Matches the service filter but should publish no live evaluation execute work.         |
| `combination-eval-and-live-queue-in` | Support trace that should execute the dangerous-combination monitor and also qualify for the seeded live high-cost queue.   | Runs the combination live evaluation and inserts into the seeded high-cost live queue. |
| `off-service-live-queue-in`          | Non-support trace that should skip live evaluations by filter but still sample into the seeded live high-cost queue.        | Skips live evaluations but inserts into the seeded high-cost live queue.               |
| `off-service-live-queue-out`         | Non-support high-cost trace that still clears the live-queue filter but should sample out of the seeded high-cost queue.    | Matches the high-cost queue filter but should not insert a live queue item.            |
| `frustration-in`                     | Low-cost non-support trace written to look like a strong Frustration match and to sample into the Frustration system queue. | Starts the Frustration system-queue flow.                                              |
| `tool-call-error`                    | Low-cost non-support trace that should deterministically match the Tool Call Errors system queue.                           | Starts the Tool Call Errors system-queue flow.                                         |
| `empty-response`                     | Low-cost non-support trace that should deterministically match the Empty Response system queue.                             | Starts the Empty Response system-queue flow.                                           |
| `output-schema`                      | Low-cost non-support trace that should deterministically match the Output Schema Validation system queue.                   | Starts the Output Schema Validation system-queue flow.                                 |


## Recommended First Runs

If you want a small smoke test first:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --fixtures warranty-eval-in,combination-eval-and-live-queue-in,off-service-live-queue-in,tool-call-error
```

That gives you:

- one trace that should run a live evaluation only
- one trace that should run a live evaluation and curate a live queue
- one trace that should skip live evaluations but curate a live queue
- one trace that should exercise deterministic system-queue matching

If you want the full matrix, run all fixtures.

## Example Run

Example:

```bash
cd /Users/sans/src/latitude-v2/tools/seeds
pnpm seed:live-monitor --fixtures warranty-eval-in,frustration-in,tool-call-error
```

Typical flow:

1. The script provisions the default system queues unless you disabled that behavior.
2. It loads the seeded evaluations and queues from the database.
3. It searches for `traceId`s whose deterministic sampling behavior matches each fixture's intended plan.
4. It prints the selected trace IDs and whether each evaluation or queue is expected to sample in or out.
5. It asynchronously sends OTLP spans to `POST /v1/traces`.
6. It prints a `runId` that you can use to correlate logs and traces.

Typical script output will include:

- the ingest endpoint
- the project slug
- the selected trace IDs
- live evaluation sample decisions
- live queue sample decisions
- system queue sample decisions
- a final reminder telling you how long to wait for `TraceEnded`

## How To Verify The Run

Watch the worker logs for these messages:

- `Live evaluation enqueue completed`
- `Live evaluation execute completed`
- `Live annotation queue curate completed`
- `System queue fan-out completed`

Also watch the workflows app when testing system queues, because system queue fan-out only starts the workflows. The actual flagging and downstream processing continue there.

In practice:

- `publishedExecuteCount > 0` in `Live evaluation enqueue completed` means at least one live evaluation was enqueued
- `Live evaluation execute completed` means a score was persisted for that trace and evaluation
- `insertedItemCount > 0` in `Live annotation queue curate completed` means a live queue item was created
- `startedWorkflows > 0` in `System queue fan-out completed` means system queue workflows were started

The script prints a `runId` specifically so you can tie the generated traces to downstream logs.

## Timing Notes

This script preserves timing within each trace, but trace completion still depends on the trace-end debounce configured in the repo.

Important:

- `--time-scale` only changes how quickly spans are sent relative to each other
- it does not shorten the trace-end debounce itself

The script prints a final wait hint based on the current `TRACE_END_DEBOUNCE_MS` value and the longest fixture dispatch window.

## Package Layout

- `src/scripts/send-live-monitor.ts`: CLI entrypoint
- `src/live-monitor/fixtures.ts`: fixture definitions and descriptions
- `src/live-monitor/runtime.ts`: queue provisioning, seeded target loading, sample-aware `traceId` search, dispatch orchestration
- `src/live-monitor/otlp.ts`: OTLP request builders and message helpers

## Future Additions

This package is intended to hold other development-facing seed tools over time, especially workflows that need to interact with live services instead of only inserting rows directly into the database.