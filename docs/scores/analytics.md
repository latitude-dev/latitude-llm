---
title: Score Analytics
description: Visualize score trends and quality metrics across your project
---

# Score Analytics

Score analytics show quality trends across your project: whether quality is improving, which evaluations catch the most failures, and when signals occur.

## Project-Level Dashboard

The project overview shows:

- **Pass/fail distribution**: How many scores passed or failed over time
- **Failure rate trend**: The percentage of failing scores over days or weeks
- **Score volume**: Total scores, broken down by source

Use these metrics for a high-level view of your agent's quality trajectory.

## Evaluation-Level Analytics

Each evaluation has its own analytics page with:

- **Pass/fail trend**: How results change over time
- **Value distribution**: A histogram of score values
- **Volume**: How many traces the evaluation has scored
- **Alignment**: Whether the evaluation agrees with human review when annotations exist for the same traces

Use evaluation analytics to spot regressions, improvements after a fix, or drift from human judgment.

## Signal-Level Analytics

Each signal tracks:

- **Occurrence count**: How many times the signal has been detected
- **Lifecycle state**: Whether the signal is new, escalating, or ongoing
- **Affected users**: The share of users the signal has impacted

## Score-Aware Trace Filtering

Traces and sessions can be filtered by score-derived properties:

- **Score state**: Failing scores, passing scores, or draft annotations
- **Value thresholds**: Scores below a quality threshold
- **Signal linkage**: Traces associated with a specific signal
- **Score source**: A specific evaluation, annotation source, or custom source

This bridges observability and reliability: you can move from a failed evaluation or signal directly to the underlying conversations.

## Filtering Analytics

Analytics dashboards use the same [filter system](../observability/filters) as trace views. Narrow analytics by time range, model, provider, score source, or custom metadata to answer targeted questions such as: "What is the failure rate for GPT-4 traces in production this week?"

## Next Steps

- [Scores Overview](./overview): How the score model works
- [Evaluations](../evaluations/overview): How automated evaluations produce scores
- [Signals](../signals/overview): How failure patterns are discovered from scores
