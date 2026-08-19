---
title: No-Code Quick Start
description: Get started with Latitude through the web UI. No coding required
---

# No-Code Quick Start

This guide walks you through the Latitude web interface. You'll learn how to navigate the product, review agent interactions, annotate conversations, and understand signals, all without writing code.

## Prerequisites

- A Latitude account (sign up at [latitude.so](https://latitude.so))
- A project with telemetry already connected (ask your development team to set this up using the [Developer Quick Start](./quick-start-dev))

## Understanding the Dashboard

When you open a project, you'll see the main navigation with these sections:

- **Search**: Find traces by meaning, and bookmark useful searches for later
- **Traces**: Every interaction your agent has had, shown as a timeline
- **Signals**: Failure patterns discovered from your agent's interactions
- **Datasets**: Saved trace collections for offline analysis
- **Settings**: Project configuration, including flaggers

## Exploring Traces

The **Traces** page shows every interaction your agent has processed. Each row represents one complete interaction, from user request to agent response.

Click on a trace to see:

- **The conversation**: The full message exchange between user and agent
- **Spans**: Individual steps the agent took (LLM calls, tool uses, etc.)
- **Metadata**: Timing, token usage, cost, and any custom metadata
- **Scores**: Any evaluation, annotation, or custom scores attached to this trace

Use the filter sidebar to narrow traces by status, cost, duration, model, provider, tags, or custom metadata.

## Finding Traces with Search

Search lives right on the **Traces** page. Type a plain-English query into the search bar, such as _"failed payments"_, _"frustrated user"_, or _"long latency on signup"_, and Latitude returns the most relevant traces, ranked by a blend of keyword and semantic match. Use `"quotes"` for exact phrases.

Filters work alongside the query, so you can scope to a time range, a specific model, traces with errors, or any custom metadata your application sends.

When a search is one you'll come back to, click **Save search** and give it a name. Saved searches are then a click away from the **Saved searches** dropdown next to the search bar, each showing its name, query, and filter count. Reopening one restores its query and filters so you, or a teammate, can pick the cohort back up. See [Saved Searches](../search/saved-searches) for details.

## Automatic Detection with Flaggers

Some failure categories are common enough that Latitude detects them for you. Every project starts with a set of built-in **flaggers** that inspect completed sessions. They come in four groups:

**User-side signals** (LLM-based)

- **Jailbreaking**: Attempts to bypass safety constraints or system instructions
- **NSFW**: Workplace-inappropriate or toxic content
- **Frustration**: Clear user dissatisfaction or loss of trust

**Agent behavior** (LLM-based)

- **Refusal**: The agent refuses a request it should handle
- **Laziness**: The agent avoids doing the requested work
- **Forgetting**: The agent loses context from earlier in the conversation
- **Incompletion**: A task was left undone and the user had to follow up
- **Thrashing**: The agent cycles between tools without making progress
- **Bluffing**: The agent continues past a failed tool call as if it succeeded
- **PII leakage**: The agent's output exposes personal data it should not have surfaced

**Response validity** (deterministic, free, runs on everything)

- **Empty response**: The agent returned an empty or degenerate response
- **Tool call errors**: Malformed, duplicated, failed, or undeclared tool calls
- **Output schema validation**: Structured output was truncated or unparseable

**Cost and efficiency** (deterministic, free, runs on everything)

- **Low cache hit rate**: Caching is on but most input tokens are missing the cache

When a flagger matches, it writes an annotation on the session's trace. That annotation feeds into [signal discovery](../signals/overview), [scores analytics](../scores/analytics), and [evaluation alignment](../evaluations/alignment) the same way a human annotation would. Under **Project Settings** you can toggle each flagger, apply a use-case preset, and set how aggressively the LLM ones sample. See [Flaggers](../annotations/flaggers) for what each one detects.

## Reviewing Traces

To leave human feedback on a trace, open it from any list (Search, Traces, a signal's logs) and use the annotation panel on the right:

- Click anywhere in the conversation to create a message-level annotation, or use the button for a conversation-level one.
- Mark it as positive (thumbs up) or negative (thumbs down).
- Write feedback describing what you observed.
- Optionally link it to an existing signal, or leave the assignment automatic.

A typical review session combines saved searches and inline annotations: open the saved search you're responsible for, click the first trace, annotate, move on. The saved search's Annotated count goes up as you work.

## Understanding Signals

The **Signals** page shows failure patterns your agent is experiencing. Signals are discovered automatically when failed scores share similar feedback, and you can also [create one yourself](../signals/create).

Each signal has:

- **A name and description** summarizing the failure pattern
- **A lifecycle state**: New, Escalating, or Ongoing
- **Linked evaluations** that monitor for this signal on live traffic
- **Occurrence trends** showing how often the signal appears

You can:

- **Generate an evaluation** from a signal to monitor it on live traffic
- **Assign** a signal and set its **priority** to triage it
- **Mute** a signal that isn't worth acting on, which moves it to the Archived tab and stops its notifications

## Understanding Evaluations

The **Evaluations** page shows automated monitors that score your agent's interactions in real time.

Evaluations are often generated from signals. When you choose Generate an evaluation on a signal, Latitude builds a monitor that watches for that pattern on live traffic. You can also define a signal's evaluation yourself when you create the signal.

Each evaluation shows:

- Score trends over time
- Alignment with human annotations (how well the automation agrees with human reviewers)
- Trigger configuration (which traces it monitors and how often)

## Understanding Scores

Scores are the fundamental unit of measurement in Latitude. Every score has:

- A **value** between 0 and 1
- A **pass/fail** verdict
- **Feedback** text describing the verdict
- A **source**: evaluation, annotation (human review), or custom

Scores appear throughout the product: on traces, in evaluation dashboards, and in signal details.

## What's Next

- [Search](../search/overview): Build cohorts of traces with hybrid search
- [Saved Searches](../search/saved-searches): Bookmark useful searches and assign ownership
- [Flaggers](../annotations/flaggers): Built-in automatic annotators for common failures
- [Scores](../scores/overview): Deep dive into how scores work
- [Annotations](../annotations/overview): Human review workflows
- [Signals](../signals/overview): Learn about signal lifecycle and management
- [Evaluations](../evaluations/overview): Understand automated monitoring
