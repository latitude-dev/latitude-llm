---
title: Evaluations Overview
description: Understand how automated evaluations monitor your agent's quality in real time
---

# Evaluations Overview

Evaluations are automated scripts that continuously annotate your agent's interactions. They are the primary mechanism for detecting quality regressions, monitoring specific failure patterns, and providing quantitative feedback on every trace.

## What Is an Evaluation

An evaluation is a **JavaScript-like script** that receives a trace's messages and metadata, processes them (optionally using LLM calls), and returns a verdict with a value and feedback.

Each evaluation consists of:

- **A name** — A descriptive identifier (e.g., "Jailbreak Detection", "Answer Completeness")
- **A script** — The logic that analyzes a trace and produces a verdict
- **A trigger configuration** — Which traces the evaluation should run against
- **A threshold** — What value separates pass from fail (default: 0.5)

## How Evaluations Work

1. A trace completes in your project (see [Trace Completion](../observability/traces))
2. Latitude checks the trace against each active evaluation's **trigger configuration**
3. For each matching evaluation, the script runs with the trace's data as input
4. The script returns a **result**: a numeric value (normalized to 0–1) and feedback text
5. Latitude creates an **annotation** from the result, attached to the trace
6. If the annotation fails, it feeds into **issue discovery**

## Evaluation Scripts

Evaluation scripts use a subset of JavaScript with access to:

- `messages` — The conversation messages from the trace
- `metadata` — Custom metadata attached to the trace
- Zod-based schema validation for structured outputs
- LLM function calls (for LLM-as-judge patterns)

A simple evaluation script might look like:

```javascript
// Check if the agent's response is under 500 characters
const lastMessage = messages[messages.length - 1]
if (lastMessage.role === 'assistant') {
  const length = lastMessage.content.length
  return {
    score: length <= 500 ? 1 : 0,
    feedback: length <= 500
      ? 'Response is concise'
      : `Response is ${length} characters — consider being more concise`
  }
}
```

More sophisticated evaluations use LLM calls to assess quality:

```javascript
// Use an LLM to judge whether the agent stayed on topic
const result = await llm({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a quality evaluator...' },
    { role: 'user', content: JSON.stringify(messages) }
  ],
  schema: z.object({
    on_topic: z.boolean(),
    feedback: z.string()
  })
})

return {
  score: result.on_topic ? 1 : 0,
  feedback: result.feedback
}
```

## Creating Evaluations

There are three ways to create evaluations:

### From Issues

The most common path. When Latitude discovers an issue from failing annotations, you can click **"Generate Evaluation"** on the issue detail page. Latitude uses the issue's description and example failures to generate a monitoring script automatically.

### From Templates

Latitude provides templates for common evaluation patterns: toxicity detection, relevance checking, format validation, and more.

### From Scratch

You can write evaluation scripts from scratch using the script editor. This is useful for domain-specific checks that aren't covered by templates or issue-generated evaluations.

## Evaluation Lifecycle

Evaluations have a simple lifecycle:

- **Draft** — Being edited, not yet running on live traffic
- **Active** — Running on every matching trace in real time
- **Paused** — Temporarily disabled, preserving configuration

## Next Steps

- [Triggers](./triggers) — Configure which traces an evaluation monitors
- [Alignment](./alignment) — Measure how well evaluations agree with human judgment
- [Issues](../issues/overview) — How evaluation failures become trackable issues
