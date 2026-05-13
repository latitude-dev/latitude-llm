---
title: No-Code Quick Start
description: Get started with Latitude through the web UI. No coding required
---

# No-Code Quick Start

This guide walks you through the Latitude web interface. You'll learn how to navigate the product, review agent interactions, annotate conversations, and understand issues, all without writing code.

## Prerequisites

- A Latitude account (sign up at [latitude.so](https://latitude.so))
- A project with telemetry already connected (ask your development team to set this up using the [Developer Quick Start](./quick-start-dev))

## Understanding the Dashboard

When you open a project, you'll see the main navigation with these sections:

- **Search**: Find traces by meaning, and bookmark useful searches for later
- **Traces**: Every interaction your agent has had, shown as a timeline
- **Issues**: Failure patterns discovered from your agent's interactions
- **Datasets**: Saved trace collections for offline analysis and simulations
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

The **Search** page is where you go to investigate a specific kind of trace. Type a plain-English query — _"failed payments"_, _"frustrated user"_, _"long latency on signup"_ — and Latitude returns the most relevant traces, ranked by a hybrid of keyword and semantic match. Use `"quotes"` for exact phrases.

Filters work alongside the query, so you can scope to a time range, a specific model, traces with errors, or any custom metadata your application sends.

When a search is one you'll come back to, click **Save search** in the toolbar. Saved searches appear on the Search landing page in a table with the columns:

- **Saved search**: The name, plus a preview of the query and filters
- **Last found**: When the most recent matching trace appeared
- **Assigned To**: A team member responsible for reviewing matches
- **Annotated**: How many matching traces have been reviewed
- **Total**: How many traces currently match

This is the workflow that used to live in the old **Annotation Queues** page. Instead of a managed queue with start/finish semantics, you scope your own cohort with a saved search and the Annotated/Total ratio tells you how far through it your team is. See [Saved Searches](../search/saved-searches) for details.

## Automatic Detection with Flaggers

Some failure categories are common enough that Latitude detects them for you. Every project starts with a set of built-in **flaggers** running on every completed trace:

- **Jailbreaking**: Attempts to bypass safety constraints
- **NSFW**: Sexual or otherwise inappropriate content
- **Refusal**: The agent refuses requests it should handle
- **Frustration**: Clear user dissatisfaction
- **Forgetting**: The agent loses conversation context
- **Laziness**: The agent avoids doing the requested work
- **Trashing**: The agent cycles between tools without making progress
- **Tool Call Errors**: Failed tool invocations
- **Output Schema Validation**: Structured output didn't conform to the declared schema
- **Empty Response**: The assistant returned an empty or degenerate response

When a flagger matches, it writes an annotation directly on the trace — no queue, no human approval step. That annotation feeds into [issue discovery](../issues/overview), [scores analytics](../scores/analytics), and [evaluation alignment](../evaluations/alignment) the same way a human annotation would. You can adjust which flaggers are enabled and how aggressively they sample under **Project Settings**. See [Flaggers](../annotations/flaggers) for the full list and detection logic.

## Reviewing Traces

To leave human feedback on a trace, open it from any list (Search, Traces, an issue's logs) and use the annotation panel on the right:

- Click anywhere in the conversation to create a message-level annotation, or use the button for a conversation-level one.
- Mark it as positive (thumbs up) or negative (thumbs down).
- Write feedback describing what you observed.
- Optionally link it to an existing issue, or leave issue assignment automatic.

A typical review session combines saved searches and inline annotations: open the saved search you're responsible for, click the first trace, annotate, move on. The saved search's Annotated count goes up as you work.

## Understanding Issues

The **Issues** page shows failure patterns your agent is experiencing. Issues are discovered automatically when failed scores share similar feedback.

Each issue has:

- **A name and description** summarizing the failure pattern
- **A lifecycle state**: New, Escalating, Resolved, Regressed, or Ignored
- **Linked evaluations** that monitor for this issue on live traffic
- **Occurrence trends** showing how often the issue appears

You can:

- **Generate an evaluation** from an issue to start automated monitoring
- **Resolve** an issue when you believe it's fixed (with an option to keep monitoring for regressions)
- **Ignore** an issue that isn't worth tracking

## Understanding Evaluations

The **Evaluations** page shows automated scripts that score your agent's interactions in real time.

Evaluations are typically generated from issues. When you click "Generate Evaluation" on an issue, Latitude creates a monitoring script that watches for that failure pattern on live traffic.

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

Scores appear throughout the product: on traces, in evaluation dashboards, in issue details, and in simulation reports.

## What's Next

- [Search](../search/overview): Build cohorts of traces with hybrid search
- [Saved Searches](../search/saved-searches): Bookmark useful searches and assign ownership
- [Flaggers](../annotations/flaggers): Built-in automatic annotators for common failures
- [Scores](../scores/overview): Deep dive into how scores work
- [Annotations](../annotations/overview): Human review workflows
- [Issues](../issues/overview): Learn about issue lifecycle and management
- [Evaluations](../evaluations/overview): Understand automated monitoring
