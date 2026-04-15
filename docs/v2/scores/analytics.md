---
title: Score Analytics
description: Visualize score trends and quality metrics across your project
---

# Score Analytics

Latitude provides time-series dashboards that help you understand quality trends across your project. Score analytics answer questions like: Is quality improving? Which evaluations catch the most failures? Are there patterns in when issues occur?

## Project-Level Dashboard

The project overview shows aggregate score metrics:

- **Pass/fail distribution** — How many scores passed vs. failed over time
- **Failure rate trend** — The percentage of failing scores, trended over days or weeks
- **Score volume** — Total number of scores produced, broken down by source (evaluation, annotation, custom)

These give you a high-level picture of your agent's quality trajectory.

## Evaluation-Level Analytics

Each evaluation has its own analytics page showing:

- **Pass/fail trend** — How the evaluation's results have changed over time
- **Value distribution** — Histogram of score values
- **Volume** — How many traces the evaluation has scored
- **Alignment** — If human annotations exist for the same traces, alignment metrics (MCC, agreement rate) are shown

Use evaluation-level analytics to detect:

- Regressions — sudden increase in failure rate
- Improvements — failure rate dropping after a fix
- Drift — alignment with human judgment changing over time

## Issue-Level Analytics

Each issue tracks its own trends:

- **Occurrence count** — How many times the issue has been detected
- **Lifecycle state** — Whether the issue is New, Escalating, Resolved, or Regressed
- **Resolution history** — When it was resolved and whether it has regressed

## Score-Aware Trace Filtering

Traces and sessions can be filtered by score-derived properties, letting you find interactions based on their quality signals:

- **Score state** — Find traces with failing scores, passing scores, or draft annotations
- **Value thresholds** — Find traces where scores fall below a quality threshold
- **Issue linkage** — Find traces associated with a specific issue
- **Score source** — Find traces scored by a specific evaluation, annotation source, or custom source

This bridges observability and reliability — you can go from "show me traces where the jailbreak evaluation failed" directly to investigating the conversations.

## Filtering Analytics

Analytics dashboards use the same [filter system](../observability/filters) as the trace view. You can narrow analytics to:

- Specific time ranges
- Specific models or providers
- Specific score sources (only evaluations, only annotations, etc.)
- Custom metadata values

This lets you answer targeted questions like "What's the failure rate for GPT-4 traces in production this week?"

## How Analytics Data Flows

Latitude uses a dual-storage approach for score data:

- **Real-time reads** (individual scores, draft-aware editing, score details) come from the primary database for immediate consistency
- **Aggregate analytics** (time-series charts, rollups, trend calculations) come from an optimized analytics store designed for fast aggregation

This means your dashboards stay responsive even as score volume grows, while individual score interactions remain immediately consistent.

## Next Steps

- [Scores Overview](./overview) — How the score model works
- [Evaluations](../evaluations/overview) — How automated evaluations produce scores
- [Issues](../issues/overview) — How failure patterns are discovered from scores
