---
title: Developer Quick Start
description: Connect your AI agent to Latitude and see your first traces and scores
---

# Developer Quick Start

This guide walks you through connecting an existing AI agent to Latitude. By the end, you'll have live traces flowing into your project and understand how scores and annotations work.

## Prerequisites

- A Latitude account (sign up at [latitude.so](https://latitude.so))
- An existing AI-powered application using a supported provider or framework

## Step 1: Create a Project

After signing in, create a new project from the dashboard. Projects are the main boundary for all reliability features: issues, evaluations, flaggers, saved searches, and simulations are all scoped to a project.

Give your project a descriptive name that matches the agent or feature you're monitoring.

## Step 2: Connect Telemetry

Latitude captures your agent's interactions through OpenTelemetry-compatible telemetry. See the [Telemetry](../telemetry/overview) section for detailed setup instructions for your specific provider or framework.

Once telemetry is connected, every LLM call, tool invocation, and agent step your application makes will appear as **spans** in Latitude. Related spans are grouped into **traces** (single interactions) and **sessions** (multi-turn conversations).

## Step 3: View Your Traces

Navigate to your project in the Latitude dashboard. You should see traces appearing in real time as your agent handles requests.

Each trace shows:

- The full conversation between user and agent
- Individual spans (LLM calls, tool calls, etc.)
- Timing, token usage, and cost
- Any scores attached to the trace

## Step 4: Explore Scores

Scores are the fundamental measurement unit. Every score is a normalized value between 0 and 1 with a **pass/fail** verdict and human-readable **feedback**.

Scores come from three sources:

1. **Evaluations**: automated scripts that run on your traces
2. **Annotations**: human review verdicts from your team
3. **Custom**: scores you submit from your own code via the API

Your project starts with default [flaggers](../annotations/flaggers) that automatically annotate traces for common problems like jailbreaking, refusals, frustration, and tool call errors. Flagger annotations are written directly on matching traces and feed straight into issue discovery, so you'll see issues forming from your live traffic without configuring anything.

## Step 5: Explore with Search and Annotate

Open the **Search** page in your project. This is where you build cohorts of traces to investigate or review.

1. Type a query like _"failed payments"_ or _"frustrated user"_. Search blends keywords and meaning, so close paraphrases work.
2. Add filters from the toolbar to narrow further (status, model, cost, custom metadata, etc.).
3. Click into any matching trace to read the conversation.
4. Use the annotation panel on the right to leave human feedback. Pick conversation-level, message-level, or text-range scope, give a thumbs-up or thumbs-down verdict, and add a short explanation.

When a search becomes a regular part of your workflow, click **Save search** to bookmark it. Saved searches surface on the Search landing page with assignee, last-found timestamp, and annotated-vs-total review progress. See [Saved Searches](../search/saved-searches) for the full lifecycle.

Your annotations feed into issue discovery and evaluation alignment alongside the annotations that flaggers create automatically.

## What's Next

- [Observability](../observability/overview): Understand spans, traces, and sessions in depth
- [Search](../search/overview): Find traces by meaning and bookmark useful cohorts
- [Scores](../scores/overview): Learn how the scoring system works
- [Annotations](../annotations/overview): Build human review workflows
- [Flaggers](../annotations/flaggers): Automatic annotators for common failure categories
- [Evaluations](../evaluations/overview): Set up automated monitoring
- [Issues](../issues/overview): Understand how failure patterns are discovered
- [Simulations](../simulations/overview): Test your agent before shipping
