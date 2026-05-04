---
title: Observability Overview
description: Understand how Latitude captures and organizes your agent's interactions
---

# Observability Overview

Latitude captures every interaction your AI agent has, from individual LLM calls to multi-turn conversations, and makes them searchable, scoreable, and actionable.

## Three Levels of Telemetry

Latitude organizes your agent's activity into three levels:

### Spans

A **span** is the smallest unit of work: a single LLM call, a tool invocation, an HTTP request, a retrieval step, or any instrumented operation in your agent's pipeline. Not every span represents an AI generation. A span might be a database query, an API call, or a custom function, none of which involve tokens or models.

Every span captures:

- Input and output content
- Latency (start, end, duration)
- Status (success or error)
- Custom metadata and tags

Spans that represent LLM calls additionally capture:

- Token usage and cost
- Model and provider information

### Traces

A **trace** is a complete interaction from start to finish, composed of one or more spans. When a user sends a message and your agent responds (including any intermediate LLM calls, tool uses, and retrieval steps), that entire sequence is one trace.

Traces are the primary unit that most reliability features operate on:

- Evaluations run against traces
- Scores are attached to traces
- Annotation queues contain traces
- Issues group failures across traces

### Sessions

A **session** is an **optional** grouping of related traces into a multi-turn conversation. Unlike spans and traces, which are always present, sessions only exist when your application provides a `session_id` with its telemetry. When the same user has an ongoing conversation with your agent, each turn is a separate trace, but they all belong to the same session.

Sessions let you:

- View the full conversation context across turns
- Evaluate behavior at the session level (not just individual turns)
- Aggregate scores and analytics across a conversation

## How Data Flows In

Your application sends telemetry to Latitude using OpenTelemetry-compatible instrumentation. See the [Telemetry](../telemetry/overview) docs for setup instructions with your specific provider or framework.

Once connected:

1. Your agent processes a request
2. Instrumented operations emit **spans** to Latitude, grouped into **traces** and optionally **sessions** as defined by your telemetry client
3. If a `session_id` is provided, the trace is associated with a **session**
4. Once a trace is considered complete (see below), Latitude triggers downstream reliability features

## Trace Completion

Latitude does not consider a trace complete the instant a span arrives. Instead, it uses a debounce window. If no new spans arrive for a trace within 5 minutes, the trace is considered done.

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

These same filters power evaluation triggers and live annotation queues. When you configure "which traces" an evaluation should monitor, you're building a filter using this same system.

### Saved searches

You can save any combination of search query and filters from the **Search** page to recall it later. Saved searches appear on the Search landing page in a table that surfaces, for each entry, the last matching trace, the number of annotated traces, and the total trace count. You can also assign a saved search to an organization member to indicate ownership.

Loading a saved search restores its query and filters in the URL. Editing either while a saved search is loaded surfaces an **Update saved search** action (with a **Save as new search** alternative). Per-row actions on the list let you rename, reassign, or delete a saved search.

## Next Steps

- [Traces](./traces): Understand the trace model and lifecycle in detail
- [Sessions](./sessions): Learn about session-level aggregation
- [Filters](./filters): Learn how the shared filter system works
- [Scores](../scores/overview): See how scores attach to your telemetry
