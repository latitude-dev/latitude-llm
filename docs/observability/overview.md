---
title: Observability overview
description: Inspect agent traces, spans, sessions, and telemetry metadata in Latitude.
---

# Observability overview

Latitude observability shows what your agent did in production. It captures the execution path for each interaction, including LLM calls, tool calls, retrieval steps, metadata, timing, token usage, cost, and errors.

For the complete product vocabulary, see [Core Concepts](../getting-started/concepts). This page focuses on the telemetry data you inspect in the Observability area.

## Telemetry model

Latitude uses three telemetry levels:

- **Spans**: individual operations such as LLM calls, tool invocations, retrieval steps, HTTP requests, or custom work.
- **Traces**: complete interactions composed of one or more spans. Traces are the main unit for debugging, search, annotations, scores, evaluations, and issues.
- **Sessions**: optional groups of related traces, usually a multi-turn conversation or workflow identified by a stable session id.

```text
Session
└─ Trace: user turn 1
   ├─ Span: retrieve context
   ├─ Span: LLM call
   └─ Span: tool call
└─ Trace: user turn 2
   ├─ Span: LLM call
   └─ Span: tool call
```

If your app does not send a session id, Latitude still captures spans and traces. You can add session grouping later with `capture()` in the TypeScript or Python SDK.

## What you can inspect

Observability views help you answer questions such as:

- What happened during this agent interaction?
- Which model, provider, tool, or service was involved?
- Where did latency, cost, or errors come from?
- Which user, session, release, environment, tags, or metadata are attached?
- What annotations, scores, or issue signals are connected to this trace?

## Trace completion

Latitude waits for a trace to stop receiving new spans before treating it as complete. This prevents downstream features from running on partial agent executions.

Once a trace is complete, Latitude can:

- make the conversation available in [Search](../search/overview)
- run matching [Evaluations](../evaluations/overview)
- apply enabled [Flaggers](../annotations/flaggers)
- update related [Scores](../scores/overview) and [Issues](../issues/overview)

## Next steps

- [Core Concepts](../getting-started/concepts)
- [Start tracing](../telemetry/start-tracing)
- [Traces](./traces)
- [Sessions](./sessions)
- [Filters](./filters)
