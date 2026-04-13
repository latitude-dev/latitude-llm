---
title: Scores Overview
description: Understand how scores work as the fundamental unit of measurement in Latitude V2
---

# Scores Overview

Scores are the atomic facts of the Latitude reliability system. Every measurement — whether from an automated evaluation, a human annotation, or your own code — becomes a score.

## What Is a Score

A score is a quantitative verdict attached to a trace. Every score has:

| Field | Description |
| --- | --- |
| **Value** | A number between 0 and 1 (normalized from the source's raw output) |
| **Pass / Fail** | A boolean derived from the value: `true` if ≥ 0.5, `false` otherwise |
| **Feedback** | A human-readable string explaining the verdict |
| **Source** | Where the score came from: `evaluation`, `annotation`, or `custom` |
| **Evaluation / Annotation reference** | A link back to the evaluation or annotation that produced the score |
| **Trace** | The trace this score measures |

Scores are always associated with a **trace** (and through the trace, optionally a session). Scores can also be associated with a specific **span** within a trace, allowing fine-grained measurement of individual operations.

## Why Scores Are Normalized

Different sources produce values on different scales:

- An evaluation script might return `true`/`false` or a number between 0 and 100
- An annotation might be thumbs up (1) or thumbs down (0)
- A custom score from your API might use any range

Latitude normalizes all values to the 0–1 range so they can be compared, aggregated, and trended regardless of source. The **pass/fail** threshold at 0.5 provides a consistent binary signal for issue discovery.

## Score Sources

Scores come from three sources:

### Evaluations

**Evaluation scores** are produced by automated scripts that run on your traces. When a trace matches an evaluation's trigger configuration, the evaluation runs and produces a score.

Evaluation scores are the primary source for continuous monitoring — they run 24/7 on live traffic and catch issues in real time.

### Annotations

**Annotations** produce scores from human feedback. When a reviewer annotates a trace through an annotation queue or inline from the trace view, their verdict becomes a score.

Annotation scores serve as the **ground truth** for the system. They anchor evaluation alignment metrics and validate that automated scoring agrees with human judgment.

### Custom

**Custom scores** are submitted by your own code through the Latitude API. Use custom scores when you have domain-specific quality signals — user satisfaction ratings, task completion metrics, or business-specific KPIs.

## How Scores Flow Through the System

Scores don't just sit on traces. They feed forward into the reliability loop:

1. **Issue Discovery**: When scores fail, Latitude analyzes their feedback to find common patterns. Similar failures are grouped into **issues** — named, trackable failure patterns.

2. **Evaluation Generation**: Issues can generate monitoring evaluations. When you click "Generate Evaluation" on an issue, Latitude creates a script that watches for that failure pattern on live traffic.

3. **Alignment Tracking**: Annotation scores are compared against evaluation scores for the same traces. This produces **alignment metrics** — MCC, confusion matrices, agreement rates — that tell you how well your automated evaluations match human judgment.

4. **Analytics**: Scores power time-series dashboards that show quality trends across your project.

## Next Steps

- [Score Sources](./sources) — Deep dive into each score source and how they're produced
- [Score Analytics](./analytics) — Understanding score trends and dashboards
- [Evaluations](../evaluations/overview) — How automated scoring works
- [Annotations](../annotations/overview) — How human feedback produces scores
