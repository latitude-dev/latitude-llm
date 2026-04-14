---
title: Scores
description: Understand how scores work as the universal measurement unit in Latitude V2
---

# Scores

Scores are the universal measurement unit in Latitude. Every verdict on your agent's interactions — whether from an automated evaluation, a human annotation, or your own code — is stored as a score.

Everything in the reliability system is built on top of scores: issues, evaluation dashboards, annotation workflows, simulations, and long-term analytics.

## What Is a Score

A score is a quantitative verdict attached to a trace. Every score has:

| Field | Description |
| --- | --- |
| **Value** | A number between 0 and 1 |
| **Pass / Fail** | A boolean verdict — `true` if value ≥ 0.5, `false` otherwise |
| **Feedback** | Human-readable text explaining the verdict |
| **Source** | Where the score came from: `evaluation`, `annotation`, or `custom` |

Scores are always associated with a **trace**. They can optionally be associated with a specific **span** within a trace for fine-grained measurement, or with a **session** for conversation-level verdicts.

## Score Sources

Every score has a source that identifies how it was produced:

### Evaluation Scores

Produced by automated scripts that Latitude runs on your traces. When a trace matches an evaluation's trigger configuration, the evaluation executes and writes a score.

Evaluation scores are the backbone of continuous monitoring — they run on every matching trace automatically, giving you real-time quality visibility.

### Annotation Scores

Produced by human reviewers. When someone annotates a trace — through an [annotation queue](../annotations/annotation-queues) or [inline from the trace view](../annotations/inline-annotations) — their verdict is stored as a score.

Annotation scores serve as **ground truth**. They represent what a human actually thinks about the agent's behavior and anchor [evaluation alignment](../evaluations/alignment) metrics.

### Custom Scores

Submitted by your own code through the Latitude API. Use custom scores for domain-specific quality signals:

- User satisfaction ratings
- Task completion metrics
- Business KPIs (conversion rates, resolution rates)
- Downstream validation (was the agent's output actually correct?)

## Normalization

Different sources produce values on different scales — an evaluation might return `true`/`false`, a human reviewer gives thumbs up/down, a custom score might use 0–100. Latitude normalizes everything to the 0–1 range so scores can be compared, aggregated, and trended regardless of source.

The **pass/fail** threshold at 0.5 provides a consistent binary signal across the entire system.

## How Scores Flow Through the System

Scores feed forward into the reliability loop:

1. **Issue Discovery** — When scores fail, Latitude clusters similar failure feedback into [issues](../issues/overview) — named, trackable failure patterns.

2. **Evaluation Generation** — Issues can generate monitoring evaluations. Latitude creates a script that watches for that failure pattern on live traffic, producing more scores.

3. **Alignment** — Annotation scores are compared against evaluation scores for the same traces. This produces [alignment metrics](../evaluations/alignment) that tell you how well automated evaluations match human judgment.

4. **Analytics** — Scores power time-series dashboards showing quality trends across your project.

## Draft Scores

Scores from human annotations start as **drafts**. A draft score:

- Is visible only to its creator
- Does not appear in analytics, issue discovery, or alignment metrics
- Can be edited and revised freely

When the reviewer publishes their annotation, the score is finalized and enters the full reliability pipeline. Once finalized, a score becomes immutable.

## Next Steps

- [Annotations](../annotations/overview) — How human reviewers create scores through annotation workflows
- [Evaluations](../evaluations/overview) — How automated scripts create scores
- [Issues](../issues/overview) — How failed scores become trackable failure patterns
- [Analytics](./analytics) — Visualizing score trends
