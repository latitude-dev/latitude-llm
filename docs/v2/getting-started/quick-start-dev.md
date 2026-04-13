---
title: Developer Quick Start
description: Connect your AI agent to Latitude V2 and see your first traces and scores
---

# Developer Quick Start

This guide walks you through connecting an existing AI agent to Latitude V2. By the end, you'll have live traces flowing into your project and understand how to attach scores.

## Prerequisites

- A Latitude account (sign up at [latitude.so](https://latitude.so))
- An existing AI-powered application using a supported provider or framework

## Step 1: Create a Project

After signing in, create a new project from the dashboard. Projects are the main boundary for all reliability features — issues, evaluations, annotation queues, and simulations are all scoped to a project.

Give your project a descriptive name that matches the agent or feature you're monitoring.

## Step 2: Connect Telemetry

Latitude captures your agent's interactions through OpenTelemetry-compatible telemetry. See the **Telemetry** section in the V1 docs for detailed setup instructions for your specific provider or framework.

Once telemetry is connected, every LLM call, tool invocation, and agent step your application makes will appear as **spans** in Latitude. Related spans are grouped into **traces** (single interactions) and **sessions** (multi-turn conversations).

## Step 3: View Your Traces

Navigate to your project in the Latitude dashboard. You should see traces appearing in real time as your agent handles requests.

Each trace shows:

- The full conversation between user and agent
- Individual spans (LLM calls, tool calls, etc.)
- Timing, token usage, and cost
- Any scores attached to the trace

## Step 4: Explore Scores

Scores are the atomic facts of the reliability system. Every score is a normalized value between 0 and 1 with a **pass/fail** verdict and human-readable **feedback**.

Scores can come from three sources:

1. **Evaluations** — automated scripts that run on your traces
2. **Annotations** — human-reviewed verdicts from your team
3. **Custom** — scores you submit from your own code via the API

Your project starts with default annotation queues that automatically flag common problems like jailbreaking, refusals, frustration, and tool call errors. Check the **Annotation Queues** page to see if any traces have been flagged for review.

## Step 5: Review an Annotation Queue

Open the **Annotation Queues** page in your project. Each queue is a focused review backlog.

Click into a queue to enter the review screen:

1. Read the conversation in the center panel
2. Create an annotation — mark it as positive (thumbs up) or negative (thumbs down) with feedback
3. Optionally link the annotation to an existing issue or create a new one
4. Mark the item as fully annotated and move to the next

Your annotations become scores that feed into issue discovery and evaluation alignment.

## What's Next

- [Observability](../observability/overview) — Understand spans, traces, and sessions in depth
- [Scores](../scores/overview) — Learn how scores flow through the system
- [Evaluations](../evaluations/overview) — Set up automated monitoring
- [Issues](../issues/overview) — Understand how failure patterns are discovered
- [Annotations](../annotations/overview) — Build human review workflows
- [Simulations](../simulations/overview) — Test your agent before shipping
