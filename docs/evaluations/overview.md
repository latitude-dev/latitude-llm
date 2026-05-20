---
title: Evaluations Overview
description: Understand how evaluations monitor your agent's quality over time
---

# Evaluations Overview

Evaluations are automated monitors that score incoming traces. They track known issue patterns, catch regressions, and show whether a production problem is getting better or worse.

Latitude can use different strategies depending on the issue. Some monitors check structural signals, while others use LLM judgment for behavior that requires semantic understanding. For issue-generated evaluations, Latitude chooses the strategy from the available examples and feedback.

## What Is an Evaluation

An evaluation defines a quality check for traces. Each evaluation has:

- **A name**: The issue or behavior being monitored
- **A description**: What the evaluation is trying to detect
- **A detection strategy**: How Latitude decides whether a trace matches the issue
- **A trigger configuration**: Which traces to monitor and at what sample rate

Most evaluations are created from issues. When you generate an evaluation from an issue, Latitude uses the issue description, example traces, annotations, and scores to build the monitor.

## How Evaluations Work

1. A trace completes in your project.
2. Latitude checks whether it matches each active evaluation's trigger configuration.
3. Matching evaluations analyze the trace.
4. Each evaluation returns a pass/fail verdict with feedback.
5. Latitude creates a score attached to the trace.
6. Failed scores feed back into [issue discovery](../issues/overview).

## Evaluation Strategies

Clear structural failures, such as tool errors or empty responses, can often be monitored directly. Semantic behavior, such as relevance, refusal quality, or whether an answer resolved the user's request, may need LLM judgment.

You do not need to choose the strategy manually for issue-generated evaluations. Latitude builds a monitor from the issue's traces and scores.

## Realignment

Evaluations improve as more evidence arrives. New annotations, flagger matches, evaluation results, and custom scores help Latitude keep monitors calibrated to recent examples and human judgment. See [Alignment](./alignment).

## Creating Evaluations

### From Issues

Generate an evaluation from an [issue](../issues/overview) to monitor that failure pattern on future traces.

### From Known Requirements

You can also create evaluations for behaviors you already know you want to enforce, such as answer completeness, policy compliance, formatting requirements, or task success.

## Evaluation Lifecycle

- **Active**: Monitoring matching traces in real time
- **Paused**: Temporarily disabled by setting sampling to `0`; configuration is preserved
- **Archived**: Read-only and no longer monitoring new traces
- **Deleted**: Removed from management views while historical results remain represented in analytics

## Next Steps

- [Triggers](./triggers): Configure which traces an evaluation monitors
- [Alignment](./alignment): Understand how evaluations stay calibrated to human judgment
- [Issues](../issues/overview): How evaluation failures become trackable issues
