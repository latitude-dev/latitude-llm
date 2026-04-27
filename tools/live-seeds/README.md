# `@tools/live-seeds`

Utility package for development-only seeding workflows that are easier to express as scripts than as database seed rows.

The database seeds still live in the regular DB packages. This package is for programmatic seed flows that talk to running services, especially the ingest pipeline.

## What This Package Does

Today this package contains one main tool:

- `seed:live-seeds`: sends OTLP traces to the ingest service using the default seeded organization, project, and API key

This is useful when you want to test the full live ingestion path end to end:

- ingest receives spans
- `SpanIngested` is emitted
- trace-end debounce finishes
- `TraceEnded` fans out
- live evaluations enqueue and execute
- live annotation queues curate traces
- system annotation queues fan out to workflows

The live-seeds script is generator-backed rather than a simple fixture replayer:

- each fixture defines its own randomized case generator
- every generated case keeps the fixture's sampling and behavioral contract
- `traceId`s are still searched so sampling resolves in or out as required
- multiple cases can be generated per fixture
- conversational cases can emit multiple traces that share the same `sessionId`
- single-interaction workflow cases can emit one trace with a wrapper span and sibling chat/tool spans
- cases are dispatched with bounded parallelism
- traces within a case are scheduled against one shared simulated case timeline
- spans within a trace are sent sequentially based on simulated finish timing
- generation can be replayed exactly with `--seed`
- runtime span enrichment follows the ambient seed conventions from `dev-docs/seeds.md`, adding only the `live-seed` tag and `live_seed_fixture` metadata field on top

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
cd apps/ingest
pnpm dev
```

```bash
cd apps/workers
pnpm dev
```

```bash
cd apps/workflows
pnpm dev
```

## Usage

Run from the package directory:

```bash
cd tools/live-seeds
pnpm seed:live-seeds --help
```

List all fixtures:

```bash
cd tools/live-seeds
pnpm seed:live-seeds --list-fixtures
```

Run the default batch of 5 generated cases per fixture:

```bash
cd tools/live-seeds
pnpm seed:live-seeds
```

Run a subset:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --fixtures warranty-eval-in,combination-eval-and-live-queue-in,tool-call-error
```

Run multiple randomized cases for each selected fixture:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --fixtures warranty-eval-in,tool-call-error --count-per-fixture 25 --parallel-cases 6
```

Run the exact same generated corpus again:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --count-per-fixture 10 --parallel-cases 4 --seed live-seeds-demo-001
```

Use a custom ingest URL:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --ingest-url http://127.0.0.1:3002
```

Speed up the within-trace timing:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --time-scale 0.5
```

Print one line per span in addition to summary progress:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --verbose-spans
```

Skip system queue provisioning:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --no-provision-system-queues
```

## CLI Options

- `--fixtures <a,b,c>`: comma-separated fixture keys to send
- `--ingest-url <url>`: base URL for the ingest service
- `--time-scale <n>`: multiplies fixture delays by the given factor
- `--count-per-fixture <n>`: generates this many cases for each selected fixture
- `--parallel-cases <n>`: maximum number of cases dispatched concurrently
- `--parallel-traces <n>`: alias for `--parallel-cases`
- `--seed <value>`: makes generation reproducible
- `--verbose-spans`: prints one log line per sent span in addition to summary progress
- `--no-provision-system-queues`: skips provisioning the default system queues before sending traces
- `--list-fixtures`: prints the available fixture keys and exits
- `--help`: prints help

## Fixture Catalog

Each fixture represents a scenario family rather than one literal trace. Every run generates a new case for that family while preserving the intended outcome. Some cases emit one trace, while conversational fixtures emit multiple traces that share a session.


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

If you want a small smoke run first:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --fixtures warranty-eval-in,combination-eval-and-live-queue-in,off-service-live-queue-in,tool-call-error --count-per-fixture 1
```

That gives you:

- one case whose target trace should run a live evaluation only
- one case whose target trace should run a live evaluation and curate a live queue
- one case whose target trace should skip live evaluations but curate a live queue
- one case that should exercise deterministic system-queue matching

If you want a broader manual validation run:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --count-per-fixture 5 --parallel-cases 4
```

If you want the full matrix at scale with reproducible output:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --count-per-fixture 20 --parallel-cases 8 --seed live-seeds-scale-001
```

## Example Run

Example:

```bash
cd /Users/sans/src/latitude-v2/tools/live-seeds
pnpm seed:live-seeds --fixtures warranty-eval-in,frustration-in,tool-call-error --count-per-fixture 3 --parallel-cases 2 --seed example-run-01
```

Typical flow:

1. The script provisions the default system queues unless you disabled that behavior.
2. It loads the seeded evaluations and queues from the database.
3. It generates `N` randomized cases for each selected fixture.
4. It searches for `traceId`s whose deterministic sampling behavior matches each generated trace's intended role.
5. It prints the seed, run ID, and per-fixture sample expectations.
6. It dispatches cases through a bounded pool of case runners.
7. Each case runner schedules traces and spans according to the simulated case timeline.

Typical script output will include:

- the ingest endpoint
- the project slug
- the seed and run ID
- total case count
- total trace count
- planned span count
- per-fixture counts
- per-case completion lines
- per-trace completion lines
- progress lines with sent cases/traces/spans and throughput
- live evaluation sample decisions
- live queue sample decisions
- system queue sample decisions
- optional per-span lines when `--verbose-spans` is enabled
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

The script prints both a `runId` and a `seed` so you can correlate logs and rerun the same generated corpus if needed.

## Timing Notes

This script preserves timing within each case and trace, but trace completion still depends on the trace-end debounce configured in the repo.

Important:

- `--time-scale` only changes how quickly spans are sent relative to each other
- it does not shorten the trace-end debounce itself
- `--parallel-cases` changes how many cases can overlap in dispatch
- `--parallel-traces` is an alias for `--parallel-cases`
- traces in the same case still follow their simulated session offsets, and each trace still sends spans sequentially

The script prints a final wait hint based on the current `TRACE_END_DEBOUNCE_MS` value and the actual dispatch duration of the run.

## Package Layout

- `src/scripts/send-live-seeds.ts`: CLI entrypoint
- `src/fixtures.ts`: generator-backed fixture registry
- `src/fixtures/`: per-fixture generator modules
- `src/runtime.ts`: queue provisioning, target loading, sample-aware trace ID search, case planning, and dispatch orchestration
- `src/otlp.ts`: OTLP request builders and message helpers
- `src/random.ts`: seeded RNG used for reproducible generation
- `src/types.ts`: shared fixture and generated-case types

## Scope

This package is intentionally dedicated to live ingestion seeding. Database row seeds still belong in the DB packages, while this tool focuses on generating and sending realistic live traces through the ingest pipeline.