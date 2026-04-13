---
title: Score Analytics
description: Visualize score trends and quality metrics across your project
---

# Score Analytics

Latitude provides time-series dashboards that help you understand quality trends across your project. Score analytics answer questions like: Is quality improving? Which evaluations are catching the most failures? Are there seasonal patterns in issues?

## Project-Level Dashboard

The project overview shows aggregate score metrics:

- **Score distribution** — How many scores passed vs. failed over time
- **Failure rate trend** — The percentage of failing scores, trended over days or weeks
- **Score volume** — Total number of scores produced, broken down by source

These give you a high-level picture of your agent's quality trajectory.

## Evaluation-Level Analytics

Each evaluation has its own analytics page showing:

- **Pass/fail trend** — How the evaluation's scores have changed over time
- **Score distribution** — Histogram of score values
- **Volume** — How many traces the evaluation has scored
- **Alignment** — If human annotations exist for the same traces, alignment metrics (MCC, agreement rate) are shown

Use evaluation-level analytics to detect:

- Regressions (sudden increase in failure rate)
- Improvements (failure rate dropping after a fix)
- Drift (alignment with human judgment changing over time)

## Issue-Level Analytics

Each issue tracks its own trends:

- **Occurrence count** — How many times the issue has been detected
- **Lifecycle state** — Whether the issue is New, Escalating, Resolved, or Regressed
- **Resolution history** — When it was resolved and whether it regressed

## Filtering Analytics

Analytics dashboards respect the same filter system as the trace view. You can narrow your analytics to:

- Specific time ranges
- Specific models or providers
- Specific score sources (only evaluations, only annotations, etc.)
- Custom metadata values

This lets you answer targeted questions like "What's the failure rate for GPT-4 traces in production this week?"

## Next Steps

- [Evaluations](../evaluations/overview) — How automated evaluations produce scores
- [Issues](../issues/overview) — How failure patterns are discovered from scores
- [Annotations](../annotations/overview) — How human feedback calibrates the system
