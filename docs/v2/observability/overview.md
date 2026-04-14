---
title: Observability Overview
description: Understand how Latitude captures and organizes your agent's interactions
---

# Observability Overview

Latitude V2 captures every interaction your AI agent has — from individual LLM calls to multi-turn conversations — and makes them searchable, scoreable, and actionable.

## Three Levels of Telemetry

Latitude organizes your agent's activity into three levels:

### Spans

A **span** is the smallest unit of work: a single LLM call, a tool invocation, a retrieval step, or any instrumented operation in your agent's pipeline.

Each span captures:

- Input and output content
- Latency (start, end, duration)
- Token usage and cost
- Model and provider information
- Status (success or error)
- Custom metadata and tags

### Traces

A **trace** is a complete interaction from start to finish, composed of one or more spans. When a user sends a message and your agent responds — including any intermediate LLM calls, tool uses, and retrieval steps — that entire sequence is one trace.

Traces are the primary unit that most reliability features operate on:

- Evaluations run against traces
- Scores are attached to traces
- Annotation queues contain traces
- Issues group failures across traces

### Sessions

A **session** is a multi-turn conversation composed of related traces. When the same user has an ongoing conversation with your agent, each turn is a separate trace, but they all belong to the same session.

Sessions let you:

- View the full conversation context across turns
- Evaluate behavior at the session level (not just individual turns)
- Aggregate scores and analytics across a conversation

## How Data Flows In

Your application sends telemetry to Latitude using OpenTelemetry-compatible instrumentation. See the [Telemetry](../telemetry/overview) docs for setup instructions with your specific provider or framework.

Once connected:

1. Your agent processes a request
2. Instrumented operations emit **spans** to Latitude
3. Latitude groups related spans into a **trace**
4. If a `session_id` is provided, the trace is associated with a **session**
5. After a period of inactivity (no new spans for the trace), Latitude considers the trace complete
6. Trace completion triggers downstream reliability features: evaluations, annotation queue curation, and system queue classification

## Trace Completion

Latitude does not consider a trace complete the instant a span arrives. Instead, it uses a debounce window — if no new spans arrive for a trace within 5 minutes, the trace is considered done.

This matters because:

- Complex agent pipelines may emit spans over an extended period
- Multi-step tool use can have significant delays between operations
- You don't want evaluations running on half-complete interactions

Once a trace is considered complete, Latitude automatically:

- Runs matching evaluations against it
- Checks if it should be added to any live annotation queues
- Classifies it against system annotation queues

## Filtering and Search

The trace dashboard provides rich filtering through a shared filter system. You can filter by:

| Filter | Description |
| --- | --- |
| Status | Error, OK, or unset |
| Name | Root span name |
| Session ID | Filter to a specific session |
| User ID | Filter to a specific user |
| Tags | Custom tags attached to spans |
| Models | Which LLM models were used |
| Providers | Which providers were called |
| Cost | Total cost of the trace |
| Duration | End-to-end duration |
| Span count | Number of spans in the trace |
| Error count | Number of errored spans |
| Token usage | Input and output tokens |
| Custom metadata | Any `metadata.*` fields you send |

These same filters power evaluation triggers and live annotation queues — when you configure "which traces" an evaluation should monitor, you're building a filter using this same system.

## Next Steps

- [Traces](./traces) — Understand the trace model and lifecycle in detail
- [Sessions](./sessions) — Learn about session-level aggregation
- [Scores](../scores/overview) — See how scores attach to your telemetry
