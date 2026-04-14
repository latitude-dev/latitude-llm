---
title: Evaluations Overview
description: Understand how automated evaluations monitor your agent's quality in real time
---

# Evaluations Overview

Evaluations are automated scripts that continuously score your agent's interactions. They are the primary mechanism for detecting quality regressions, monitoring specific failure patterns, and providing quantitative feedback on every trace.

## What Is an Evaluation

An evaluation is a **JavaScript-like sandboxed script** that receives a trace's conversation and metadata, processes them (optionally using LLM calls), and returns a verdict.

Each evaluation consists of:

- **A name** — A descriptive identifier (e.g., "Jailbreak Detection", "Answer Completeness")
- **A description** — A longer explanation of what the evaluation checks for
- **A script** — The logic that analyzes a trace and produces a verdict
- **A trigger configuration** — Which traces the evaluation should run against, how often, and at what sample rate

## How Evaluations Work

1. A trace completes in your project (after a debounce window with no new spans)
2. Latitude checks the trace against each active evaluation's **trigger configuration**
3. For each matching evaluation, the script runs with the trace's data as input
4. The script returns a verdict using `Passed()` or `Failed()` helpers
5. Latitude creates a **score** from the result, attached to the trace
6. If the score fails, it feeds into **issue discovery**

## Evaluation Scripts

Evaluation scripts run inside a host-controlled sandbox with access to:

- `Passed(score?, feedback)` — Return a passing verdict. Feedback is always required. Score defaults to `1` if omitted.
- `Failed(score?, feedback)` — Return a failing verdict. Feedback is always required. Score defaults to `0` if omitted.
- `llm(prompt, options?)` — Make an LLM call through Latitude's managed infrastructure. Accepts a string prompt and optional configuration (temperature, maxTokens, schema).
- `parse(value, schema)` — Validate an unknown value against a Zod schema.
- `zod` — The Zod schema library for structured validation.

A simple evaluation script might look like:

```javascript
const lastMessage = messages[messages.length - 1]
if (lastMessage.role === 'assistant') {
  const length = lastMessage.content.length
  if (length <= 500) {
    return Passed(`Response is concise at ${length} characters`)
  }
  return Failed(`Response is ${length} characters — consider being more concise`)
}
```

More sophisticated evaluations use LLM calls to assess quality:

```javascript
const result = await llm(
  `You are a quality evaluator. Analyze this conversation and determine if the assistant stayed on topic.\n\nConversation:\n${JSON.stringify(messages)}`,
  {
    schema: z.object({
      on_topic: z.boolean(),
      feedback: z.string()
    })
  }
)

const parsed = await parse(result, z.object({
  on_topic: z.boolean(),
  feedback: z.string()
}))

if (parsed.valid && result.on_topic) {
  return Passed(result.feedback)
}
return Failed(result.feedback)
```

The script never talks directly to the outside world — all external capabilities are exposed as host-controlled functions. The same scripts run both in backend monitoring and in the [simulation CLI](../simulations/cli).

## Creating Evaluations

### From Issues

The most common path. When Latitude discovers an [issue](../issues/overview) from failing scores, you can click **"Generate Evaluation"** on the issue detail page. Latitude uses the issue's description and example failures to generate a monitoring script automatically through an optimization pipeline that maximizes alignment with human judgment.

### User-Authored

You can write evaluation scripts directly. This is useful for domain-specific checks that aren't covered by issue-generated evaluations. The exact user-authored evaluation editor UX is still under development.

## Evaluation Lifecycle

Evaluations have a clear lifecycle:

- **Active** — Running on matching traces in real time. An active evaluation has `sampling > 0`.
- **Paused** — Temporarily disabled by setting `sampling` to `0`. Configuration is preserved; resume by setting sampling back to a positive value.
- **Archived** — Read-only. Archived evaluations are visible in the UI but never trigger. When an issue is manually ignored, its linked evaluations are archived immediately.
- **Deleted** — Soft-deleted from the management UI but still represented in historical analytics.

## Next Steps

- [Triggers](./triggers) — Configure which traces an evaluation monitors
- [Alignment](./alignment) — Measure how well evaluations agree with human judgment
- [Issues](../issues/overview) — How evaluation failures become trackable issues
