---
title: Filters
description: Use the shared filter system to narrow traces, configure evaluation triggers, and build annotation queues
---

# Filters

Latitude uses a universal filter system across the platform. The same filters you use to search traces also power evaluation triggers and annotation queue configuration — learn it once, use it everywhere.

## How Filters Work

A filter is a set of field conditions. All conditions within a field are AND'd together, and all fields are AND'd across each other. For example, "Status is ERROR **and** Cost is greater than 100 microcents" returns only traces matching both criteria.

Filters are available from the toolbar on the Traces page, and appear in the configuration UI for evaluation triggers and annotation queues.

## Available Filter Fields

| Field | Description | Example |
| --- | --- | --- |
| **Status** | Trace completion status: OK, ERROR, or UNSET | `status in [error]` |
| **Name** | Root span name (the `path` you set in `capture()`) | `name eq "invoke_agent"` |
| **Session ID** | Filter to a specific multi-turn session | `sessionId eq "session-abc"` |
| **User ID** | End-user identifier from telemetry metadata | `userId eq "user-42"` |
| **Tags** | Custom tags attached to spans | `tags in ["production", "canary"]` |
| **Models** | LLM models used in the trace | `models in ["gpt-4o"]` |
| **Providers** | LLM providers called | `providers in ["openai"]` |
| **Services** | OpenTelemetry service names | `serviceNames in ["api-server"]` |
| **Cost** | Total cost in microcents | `cost gte 100` |
| **Duration** | End-to-end duration in nanoseconds | `duration gte 5000000000` |
| **TTFT** | Time to first token | `startTime gte ...` |
| **Span Count** | Number of spans in the trace | `spanCount gte 10` |
| **Error Count** | Number of errored spans | `errorCount gte 1` |
| **Tokens Input** | Total input tokens across LLM calls | `tokensInput gte 1000` |
| **Tokens Output** | Total output tokens across LLM calls | `tokensOutput gte 500` |
| **Metadata** | Custom key-value metadata your application sends | `metadata.env eq "production"` |

## Operators

Filters support 10 operators:

| Operator | Meaning | Works With |
| --- | --- | --- |
| `eq` | Equals | All fields |
| `neq` | Not equals | All fields |
| `gt` | Greater than | Numeric fields |
| `gte` | Greater than or equal | Numeric fields |
| `lt` | Less than | Numeric fields |
| `lte` | Less than or equal | Numeric fields |
| `in` | Value is in set | Status, tags, models, providers, services |
| `notIn` | Value is not in set | Status, tags, models, providers, services |
| `contains` | Substring match (case-insensitive) | Text fields, metadata |
| `notContains` | Substring does not match | Text fields, metadata |

## Custom Metadata Filters

Your application can send structured metadata with its telemetry. Filter on any metadata field using dot-notation:

- `metadata.env` — top-level key
- `metadata.runtime.region` — nested keys (up to 12 levels deep)

Metadata filters support all operators, so you can filter for exact matches, ranges, set membership, and substring searches on your custom fields.

## Combining Filters

All active filters combine with **AND** logic. Common combinations:

- **Status** = ERROR **and** **Cost** > 100 — find expensive failures
- **Models** = gpt-4o **and** **Duration** > 5s — find slow GPT-4o traces
- **Metadata** `environment` = `production` **and** **Error Count** > 0 — find production errors
- **Tags** in `["canary"]` **and** **Tokens Output** > 2000 — find verbose canary responses

## Where Filters Are Used

| Feature | How Filters Are Used |
| --- | --- |
| **Trace dashboard** | Interactive filtering from the toolbar |
| **Evaluation triggers** | Define which traces an evaluation monitors |
| **Live annotation queues** | Define which traces automatically enter a queue |
| **Score analytics** | Narrow analytics dashboards to specific trace subsets |

When you configure an evaluation trigger or live annotation queue, you're building a filter using this same system. An empty filter means "match all traces."

## Next Steps

- [Traces](./traces) — Browse and filter your traces
- [Evaluation Triggers](../evaluations/triggers) — Use filters to control evaluation scope
- [Annotation Queues](../annotations/annotation-queues) — Use filters to build live review queues
