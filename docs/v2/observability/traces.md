---
title: Traces
description: Understand the trace model, lifecycle, and how to work with traces in Latitude
---

# Traces

A trace represents one complete interaction between a user and your agent. It's the primary unit that reliability features operate on — evaluations, annotations, issues, and simulations all reference traces.

## What's in a Trace

A trace is composed of one or more **spans** — the individual operations your agent performed. A typical trace might include:

- An incoming user message
- One or more LLM calls
- Tool invocations (search, database queries, API calls)
- Retrieval operations
- The final agent response

Latitude materializes traces from raw spans, giving you:

- **Root span name** — The top-level operation name
- **Overall status** — OK or error, derived from constituent spans
- **Total duration** — End-to-end timing
- **Aggregated tokens** — Total input and output tokens across all LLM calls
- **Aggregated cost** — Total cost across all provider calls
- **Span count** — How many individual operations were involved
- **Error count** — How many spans errored
- **Models and providers** — Which LLMs and providers were used
- **Tags and metadata** — Custom labels and structured metadata

## Trace Completion

Latitude uses a **debounce window** to determine when a trace is finished. After the last span for a trace arrives, Latitude waits for a quiet period (default: 5 minutes). If no new spans arrive during that window, the trace is considered complete.

Each new span arrival resets the debounce timer. This handles common scenarios:

- Multi-step agent loops where tool calls and LLM responses alternate over time
- Parallel operations that complete at different times
- Retries and fallback logic

Once a trace is complete, Latitude triggers downstream reliability processes:

- **Evaluation triggers** check if any active evaluations should run against this trace
- **Live annotation queues** check if the trace matches any queue filters
- **System annotation queues** classify the trace against default review categories

## Viewing Traces

The **Traces** page in your project shows a table of all traces, newest first. Each row displays key metadata at a glance: name, status, duration, cost, tokens, and timestamp.

Click on a trace to open the detail view, which shows:

- **The full conversation** — All messages exchanged between user and agent
- **The span tree** — A hierarchical view of every operation your agent performed
- **Scores** — Any evaluation, annotation, or custom scores attached to this trace
- **Metadata** — Custom fields, timing details, and resource usage

## Filtering Traces

Use the filter sidebar to narrow your view. Filters use the shared filter system described in the [Observability Overview](./overview), supporting combinations like:

- Status is "error" AND cost > $0.10
- Model includes "gpt-4" AND duration > 5 seconds
- Custom metadata `environment` equals "production"

You can also add traces to annotation queues directly from the trace table by selecting rows and using the bulk action.

## Traces and Sessions

When your application provides a `session_id` with its telemetry, Latitude groups related traces into sessions. You can filter traces by session ID to see the full conversation history, or navigate to the Sessions page for a session-focused view.

## Next Steps

- [Sessions](./sessions) — Session-level conversations and aggregation
- [Scores](../scores/overview) — How scores attach to traces
- [Annotations](../annotations/inline-annotations) — Annotating directly from trace views
