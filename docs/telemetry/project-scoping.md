---
title: Project scoping
description: Route spans to the right Latitude project — one project per process, or many.
---

Latitude can route spans to different projects based on how each capture is configured. Most
SDKs already set a project at startup; this page covers the additional knobs available when
**one process needs to emit to multiple projects** (for example, a service that runs several
agents that should each show up as a distinct Latitude project).

## The resolution chain

For every span Latitude ingests, the server applies this order (highest priority first):

1. **Span attribute** `latitude.project`
   Set by `capture({ projectSlug })` in the TypeScript SDK or `capture({"project_slug": ...})`
   in Python. The slug travels on the span itself, so a single OTLP export can carry spans
   for multiple projects.
2. **OTEL resource attribute** `latitude.project`
   For bare-OpenTelemetry setups: set `latitude.project` once on the SDK's `Resource` and every
   span inherits it.
3. **HTTP header** `X-Latitude-Project`
   The Latitude SDKs send this automatically when a `projectSlug` is passed to the constructor.
   Acts as the per-batch default.

If none of those resolve to a project that belongs to your organization, the span is rejected.

## Response contract (OTLP `partial_success`)

Latitude follows the [OTLP specification](https://opentelemetry.io/docs/specs/otlp/) for
partial-success responses. Customers writing their own exporters can rely on these guarantees:

| Batch shape                          | HTTP status | Body                                                            |
| ------------------------------------ | ----------- | --------------------------------------------------------------- |
| All spans resolve                    | **200 OK**  | empty `ExportTraceServiceResponse`                              |
| Some spans rejected (mixed)          | **200 OK**  | `partialSuccess { rejectedSpans: N, errorMessage: "..." }`      |
| Every span rejected                  | **400**     | `google.rpc.Status` shape: `{ code: 400, message: "..." }`      |
| Malformed OTLP payload               | **400**     | `{ error: "..." }`                                              |

Note: `partialSuccess` only appears on **2xx** responses — it means "some spans were
persisted, here is a count of what we dropped". When **nothing** was persisted we return a
plain `google.rpc.Status`-shaped error body so exporters don't mistakenly treat the rejection
as a partial save.

The `errorMessage` always points back to this page so an exporter that logs the response
gives operators a single place to look. **Don't move this page** without coordinating a
server-side update — the URL is hard-coded in the ingest error response.

## Patterns

Three runnable examples ship with each SDK. Start with the one that matches your shape.

### 1. Single-project default (existing setup)

For services that emit to exactly one Latitude project. The ctor `projectSlug` is sent on
every export as `X-Latitude-Project`, and every `capture()` inherits it.

**TypeScript** — see [`examples/test_project_scoping_single.ts`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/typescript/examples/test_project_scoping_single.ts):

```ts
import { capture, Latitude } from "@latitude-data/telemetry"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
})

await capture("greet", async () => {
  // routed to LATITUDE_PROJECT_SLUG
})
```

**Python** — see [`examples/test_project_scoping_single.py`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/python/examples/test_project_scoping_single.py):

```python
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
)

@capture("greet")
def greet():
    ...  # routed to LATITUDE_PROJECT_SLUG
```

### 2. Multi-project from day 1 (no ctor default)

For services that emit to multiple Latitude projects — e.g. one process that runs several
agents. Skip the ctor `projectSlug` and set `projectSlug` on every `capture()`.

**TypeScript** — see [`examples/test_project_scoping_multi.ts`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/typescript/examples/test_project_scoping_multi.ts):

```ts
import { capture, Latitude } from "@latitude-data/telemetry"

const latitude = new Latitude({ apiKey: process.env.LATITUDE_API_KEY! })

await capture(
  "full-stack-agent-run",
  async () => { /* ... */ },
  { projectSlug: "full-stack-agent" },
)

await capture(
  "call-summariser-run",
  async () => { /* ... */ },
  { projectSlug: "call-summariser" },
)
```

**Python** — see [`examples/test_project_scoping_multi.py`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/python/examples/test_project_scoping_multi.py):

```python
from latitude_telemetry import Latitude, capture

latitude = Latitude(api_key=os.environ["LATITUDE_API_KEY"])

@capture("full-stack-agent-run", {"project_slug": "full-stack-agent"})
def run_full_stack_agent():
    ...

@capture("call-summariser-run", {"project_slug": "call-summariser"})
def run_call_summariser():
    ...
```

A `capture()` that doesn't set `projectSlug` AND a SDK that doesn't have a ctor default →
the spans are rejected with `partialSuccess`. Pick one of the two so every span has a route.

### 3. Per-span override on top of a default

Most common when the default project comes from an env var but specific runs need to route
elsewhere (e.g. shipping evaluation runs to a separate project).

**TypeScript** — see [`examples/test_project_scoping_env.ts`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/typescript/examples/test_project_scoping_env.ts):

```ts
const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,  // env-driven default
})

// inherits the default
await capture("default-route", async () => { /* ... */ })

// per-capture override — wins over the ctor default
await capture(
  "evaluation-batch",
  async () => { /* ... */ },
  { projectSlug: "evaluation-runs" },
)
```

**Python** — see [`examples/test_project_scoping_env.py`](https://github.com/latitude-dev/latitude-llm/blob/main/packages/telemetry/python/examples/test_project_scoping_env.py):

```python
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
)

@capture("default-route")
def default_route():
    ...

@capture("evaluation-batch", {"project_slug": "evaluation-runs"})
def evaluation_batch():
    ...
```

## Handling `partial_success` in custom exporters

If you're integrating from bare OpenTelemetry (no Latitude SDK) and want to surface
rejections, watch for `partialSuccess.rejectedSpans > 0` in the OTLP response body. The
common causes:

- Missing `latitude.project` on the span AND no `X-Latitude-Project` header on the export.
- The resolved slug doesn't exist in your organization (typo, or a stale slug after the
  project was renamed).

The fix is always to make sure each span has a way to resolve a project — either the span
attribute, a resource attribute, or the header default.
