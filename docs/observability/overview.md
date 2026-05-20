---
title: Core concepts
description: "Understand Latitude's telemetry taxonomy: spans, traces, and sessions."
---

# Core concepts

Latitude organizes agent activity into three telemetry levels: **spans**, **traces**, and **sessions**. Understanding this taxonomy helps you decide where to attach context, how to debug runs, and how product features like search, scores, issues, and evaluations relate to your data.

## Spans

A **span** is the smallest unit of captured work. It can represent an LLM call, a tool invocation, a retrieval step, an HTTP request, or any other instrumented operation in your agent pipeline.

Every span captures operational context such as:

- input and output content when available
- start time, end time, and duration
- success or error status
- tags and metadata

LLM spans also capture model-specific information such as provider, model, token usage, and cost.

## Traces

A **trace** is one complete interaction from start to finish, composed of one or more spans. When a user sends a message and your agent responds, the LLM calls, tool calls, retrieval steps, and other work that happened during that turn are grouped into a trace.

Traces are the main unit used across Latitude:

- the trace detail view shows the full waterfall of spans
- search returns matching trace conversations
- evaluations run against completed traces
- scores are attached to traces
- flaggers annotate traces automatically
- issues group related trace failures

## Sessions

A **session** is an optional grouping of related traces into a multi-turn conversation. Traces always exist; sessions only exist when your application sends a `sessionId` / `session_id` with telemetry.

Use sessions when multiple traces belong to the same user conversation or workflow. For example, each user turn in a chat agent can be its own trace, while the whole conversation shares one session.

Sessions let you:

- review full conversation context across turns
- group traces by a stable conversation id
- analyze user-level or conversation-level behavior

## How they fit together

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

## Trace completion

Latitude waits for a trace to stop receiving new spans before treating it as complete. This prevents downstream features from running on partial agent executions.

Once a trace is complete, Latitude can:

- make the conversation available in [Search](../search/overview)
- run matching [Evaluations](../evaluations/overview)
- apply enabled [Flaggers](../annotations/flaggers)
- update related [Scores](../scores/overview) and [Issues](../issues/overview)

## Next steps

- [Start tracing](../telemetry/start-tracing)
- [Traces](./traces)
- [Sessions](./sessions)
- [Filters](./filters)
