# Spans

The reliability system extends, but does not replace, the existing telemetry model.

## Existing Base

Today the repo already has:

- raw `spans` in ClickHouse
- `traces` materialized from spans
- time-first project-scoped query patterns

Reliability builds on top of that telemetry base rather than introducing a second trace store.

## Reliability Additions

Reliability adds:

- `simulation_id` on spans as an optional simulation link stored as a non-null `FixedString(24)` with the empty-string sentinel when absent
- propagation of `simulation_id` into trace/session-level reporting where needed
- a new session materialization, since the product explicitly talks about spans, traces, and sessions
- a `SpanIngested` domain event emitted directly through `createEventsPublisher(queuePublisher)` after the span-ingestion process durably writes spans for a trace
- a debounced `TraceEnded` domain event emitted directly through `createEventsPublisher(queuePublisher)` after a trace has received no new spans for a named debounce window whose initial default is `5 minutes`

These telemetry additions should land through new ClickHouse migrations rather than by rewriting existing migration history. Because they are additive extensions to existing unreleased tables, ordinary additive statements and sensible defaults are preferred over bespoke compatibility choreography unless a later change truly requires a rebuild.

## Trace Completion Signal

Reliability should not treat each span arrival as the moment a trace is complete.

Instead:

- the span-ingestion process publishes `SpanIngested` directly through `createEventsPublisher(queuePublisher)` after the span write succeeds
- the `domain-events` dispatcher reacts to `SpanIngested` by publishing `live-traces:end` keyed by `(organizationId, projectId, traceId)`
- if another span for that trace arrives before the delay elapses, the same logical `live-traces:end` task is replaced/rescheduled so the debounce window starts over
- when the debounce window elapses, `live-traces:end` publishes `TraceEnded` directly through `createEventsPublisher(queuePublisher)`
- the `domain-events` dispatcher then reacts to `TraceEnded` by publishing downstream tasks such as `live-evaluations:enqueue`, `live-annotation-queues:curate`, and `system-annotation-queues:flag`
- the `domain-events` dispatcher never executes downstream reliability side effects inline; it only dispatches tasks

This keeps the trace-completion boundary explicit while still using the existing BullMQ transport, direct high-volume domain-event publication into `domain-events`, dispatcher-only domain-event handling, and task fan-out pattern.

## Why Sessions Matter

Sessions are needed so that:

- evaluations can target session-level conversations cleanly
- score rollups can aggregate at session level
- issue and simulation drilldowns can show the right granularity

## Score Analytics Over Telemetry

Reliability should not depend on hot joins from spans to raw scores for every query.

Exact ClickHouse materialized score analytics tables are still pending precise definition until the reporting/query shapes stabilize.

The later score-aware analytics layer will likely need to cover responsibilities such as:

- span
- trace
- session

Those later materializations feed:

- score-aware filters
- issue drilldown
- evaluation dashboards
- simulation reporting

## Sort-Key Rule

Sparse reliability dimensions such as `simulation_id` should not move ahead of the existing time-first access pattern.

They should be supported with indexes and later score-aware materializations rather than by rewriting the base observability sort order.

When stored in ClickHouse, `simulation_id` should keep the fixed-width CUID contract while remaining non-null, using the empty-string sentinel when the span is not part of a simulation.
