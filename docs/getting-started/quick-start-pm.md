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

- **Traces**: Every interaction your agent has had, shown as a timeline
- **Sessions**: Multi-turn conversations grouped together
- **Evaluations**: Automated monitoring scripts and their results
- **Issues**: Failure patterns discovered from your agent's interactions
- **Annotation Queues**: Review backlogs where your team provides human feedback
- **Simulations**: Test runs of your agent against scenarios

## Exploring Traces

The **Traces** page shows every interaction your agent has processed. Each row represents one complete interaction, from user request to agent response.

Click on a trace to see:

- **The conversation**: The full message exchange between user and agent
- **Spans**: Individual steps the agent took (LLM calls, tool uses, etc.)
- **Metadata**: Timing, token usage, cost, and any custom metadata
- **Scores**: Any evaluation, annotation, or custom scores attached to this trace

Use the filter sidebar to narrow traces by status, cost, duration, model, provider, tags, or custom metadata.

## Reviewing Annotation Queues

Annotation queues are where your team provides human judgment on agent interactions. Your project starts with default queues that automatically flag common problems:

- **Jailbreaking**: Attempts to bypass safety constraints
- **Refusal**: The agent refuses requests it should handle
- **Frustration**: Clear user dissatisfaction
- **Forgetting**: The agent loses conversation context
- **Laziness**: The agent avoids doing the requested work
- **Inappropriate Content**: Sexual or otherwise not-safe-for-work content
- **Trashing**: The agent cycles between tools without making progress
- **Tool Call Errors**: Failed tool invocations
- **Resource Outliers**: Unusually high latency or cost
- **Output Schema Validation**: Structured output didn't conform to the declared schema
- **Empty Response**: The assistant returned an empty or degenerate response

Open a queue and click into it to start reviewing. The review screen shows three sections:

1. **Metadata**: Timestamp, duration, tokens, cost, and existing scores for the current trace
2. **Conversation**: The full message exchange between user and agent
3. **Annotations**: Queue instructions, existing annotations, and a button to create new ones

To annotate:

- Click anywhere in the conversation to create a message-level annotation, or use the button for a conversation-level annotation
- Mark it as positive (thumbs up) or negative (thumbs down)
- Write feedback describing what you observed
- Optionally link it to an existing issue, or leave issue assignment automatic
- Click "Fully Annotated" when you've finished reviewing the trace

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

- [Scores](../scores/overview): Deep dive into how scores work
- [Annotations](../annotations/overview): Human review workflows
- [Issues](../issues/overview): Learn about issue lifecycle and management
- [Evaluations](../evaluations/overview): Understand automated monitoring
