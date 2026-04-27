# Simulations

Simulations are the CI/regression-testing layer of the reliability system.

## Role In The System

Simulations let users:

- execute agent behavior locally or in CI
- evaluate it with Latitude issue monitors and custom code
- optionally upload traces and scores back to Latitude
- inspect hosted reports by simulation run

The CLI and SDK are intentionally local-first:

- the CLI should be useful as a standalone simulation runner, even without the hosted Latitude platform
- users should be able to run simulations without depending on a hosted Latitude workspace if they do not want one
- simulations can run without instrumenting the user's LLM-powered application
- upload back to Latitude is optional, not required for the core simulation-runner experience

## Execution Model

The execution architecture follows the original proposal:

- a performant JS/TS CLI plus JS/TS SDK
- additional lightweight SDKs for languages such as Python, Ruby, PHP, and Go
- the CLI is agnostic to the end user's programming language and build process
- the user configures the command that should be executed to run the target `*.sim.*` entrypoints through their chosen runtime/toolchain
- the CLI discovers `*.sim.*` entrypoints
- local HTTP bridge between CLI and SDK
- local OTEL-compatible collector reused from the ingest pipeline
- simulation-related traces/sessions can be captured when the agent is instrumented
- simulations can still run without instrumentation by accepting score-only uploads
- optional upload to Latitude
- local-only mode when upload is not desired

The simulation system must reuse the same evaluation artifact as backend monitoring. It should not invent a second evaluation format.

Because Latitude evaluations are sandboxed JavaScript-like scripts, the CLI can download those evaluation artifacts, execute them locally, and only push the resulting scores back through the API if the user wants to upload them.

When the CLI uploads score results:

- it should reuse `POST /v1/organizations/:organizationId/projects/:projectId/scores`
- ordinary custom-code outputs use the default custom-score contract on that route
- downloaded Latitude evaluation results use the same route with `_evaluation: true`, evaluation-score metadata, and the evaluation CUID as `source_id`

The CLI should print a testing-style summary and return CI-friendly exit codes.

## Base Model

```typescript
type SimulationMetadata = {
  threshold: number | "CUSTOM"; // percentage [0, 100] or "CUSTOM"
  scenarios: number; // number of dataset rows/scenarios executed by the run
  file: string; // simulation entrypoint filename that was used to run the simulation
  sdk: string; // language and version, for example "javascript@1.2.3"
};
```

The simulation row stores:

- simulation name
- dataset reference
- list of evaluations used by the run
- pass/fail
- errored helper flag
- metadata
- error
- started/finished timestamps

`error` remains the source of truth. Because simulations live in Postgres, `errored` is a regular boolean that must be set by application code at write time from whether the error field is present.

Required Postgres indexes:

- btree on `(organization_id, project_id, created_at)` for project-scoped simulation runs listing and pagination
- do not add GIN/JSONB indexes on `metadata` or array indexes on `evaluations` in the simulations foundation phase; simulation reporting filters are project/time/run-id oriented and deeper analytics live in ClickHouse

## Telemetry Hooks

Reliability adds:

- `simulation_id` on spans
- `simulation_id` on scores

That id must also flow into trace/session-level rollups where needed for reporting.

## Entrypoint Semantics

The SDK entrypoint should preserve the proposal shape:

- `Simulation({ name, threshold, dataset, agent, evaluations })`
- `Passed(score?, feedback)` and `Failed(score?, feedback)` require feedback; when the numeric value is omitted they default to pass = `1` and fail = `0`
- the per-language SDK should stay lightweight and only provide the simulation entrypoint/runtime bridge needed by the CLI
- the CLI is responsible for invoking the user-configured command that executes the chosen `*.sim.*` entrypoints
- built-in Latitude evaluations can be referenced by id or by the special `issues` selector
- built-in Latitude evaluations download their sandboxed scripts and run locally when the simulation has instrumented conversation data
- custom code evaluations receive `output`, `scenario`, `conversation`, and `metadata`
- custom code evaluations can return one score or an array of scores

Dataset sources:

- a Latitude dataset CUID
- a custom function loader that returns scenarios (stored as `"CUSTOM"` sentinel)
- query-backed datasets are deferred to post-MVP

## Product Surface

The hosted `Simulations` page includes:

- project-wide aggregate cards for total simulations, total scenarios, total token usage split between traces and evaluations, and total cost split between traces and evaluations
- simulation runs table
- simulation details view

The simulation runs table includes:

- `Name`
- `Score`
- `Duration`
- `Scenarios`
- `Evaluations`
- `Dataset`
- `Timestamp`

Rows with run errors should be tinted.

Pagination:

- limit/offset

The details view must show:

- full name and creation timestamp
- average score, duration, and scenario count
- run metadata
- evaluations used
- dataset reference
- spans/traces/sessions when instrumentation exists
- direct scores when instrumentation does not exist

## Still Pending Precise Definition

- exact query-backed dataset authoring/query UX
- exact SDK ergonomics beyond the shared `Simulation` entrypoint contract
