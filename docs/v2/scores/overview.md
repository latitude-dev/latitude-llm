---
title: Scores Overview
description: Understand how scores work as the universal measurement unit in Latitude
---

# Scores Overview

Scores are the universal measurement unit in Latitude. Every verdict on your agent's interactions, whether from an automated evaluation, a human annotation, or your own code, is stored as a score.

Everything in Latitude's reliability system is built on top of scores: issues, evaluation dashboards, annotation workflows, simulations, and long-term analytics.

## What Is a Score

A score is a quantitative verdict attached to a trace. Every score has:

| Field | Description |
| --- | --- |
| **Value** | A number between 0 and 1 |
| **Pass / Fail** | A boolean verdict set by the score producer |
| **Feedback** | Human-readable text explaining the verdict, intentionally phrased so similar failures cluster together cleanly |
| **Source** | Where the score came from: `evaluation`, `annotation`, or `custom` |
| **Error** | Canonical error text when the score represents a real execution failure (not a failed verdict) |

Scores also carry resource usage fields: **duration** (in nanoseconds), **tokens**, and **cost** (in microcents).

Scores are always associated with a **trace**. They can optionally be associated with a specific **span** within a trace, a **session** for conversation-level context, a **simulation** for test runs, or an **issue** for failure pattern tracking.

## Score Sources

Every score has a source that identifies how it was produced:

### Evaluation Scores

Produced by automated scripts that Latitude runs on your traces. When a trace matches an evaluation's trigger configuration, the evaluation executes and writes a score.

Evaluation scores are the backbone of continuous monitoring: they run on every matching trace automatically, giving you real-time quality visibility.

### Annotation Scores

Produced by human reviewers. When someone annotates a trace through an [annotation queue](../annotations/annotation-queues) or [inline from the trace view](../annotations/inline-annotations), their verdict is stored as a score.

Annotation scores serve as **ground truth**. They represent what a human actually thinks about the agent's behavior and anchor [evaluation alignment](../evaluations/alignment) metrics.

### Custom Scores

Submitted by your own code through the Latitude API. Use custom scores for domain-specific quality signals:

- User satisfaction ratings
- Task completion metrics
- Business KPIs (conversion rates, resolution rates)
- Downstream validation (was the agent's output actually correct?)

## Score Lifecycle

A score progresses through a defined lifecycle:

- **Draft**: The score is still being worked on. It appears in annotation review and editing views but is excluded from analytics, issue discovery, and evaluation alignment.
- **Passed (final)**: The score passed and is now permanent. It appears in analytics dashboards.
- **Failed (awaiting issue)**: The score failed. Latitude is in the process of matching it to an existing issue or creating a new one.
- **Failed (final)**: The score failed and has been linked to an issue. It appears in analytics dashboards and the issue's detail page.
- **Errored**: The score represents a real execution failure (e.g., the evaluation script crashed). Errored scores are visible for observability but excluded from issue discovery and evaluation alignment.

Once a score is finalized (no longer a draft), it becomes permanent and cannot be edited.

## Draft Scores

Scores from human annotations start as **drafts**. A draft score:

- Persists immediately so it survives page refreshes
- Is visible in annotation queue review and in-progress editing
- Does not appear in analytics, issue discovery, or alignment metrics
- Can be edited and revised while still in draft state

Human-created drafts are finalized automatically after a quiet period (default: 5 minutes after the last edit). System-created drafts (from automatic queue classification) wait for explicit human review before finalization.

## How Scores Flow Through the System

Scores feed forward into every part of Latitude:

1. **Issue Discovery**: When scores fail (and are not drafts or errored), Latitude clusters similar failure feedback into [issues](../issues/overview), which are named, trackable failure patterns.

2. **Evaluation Generation**: Issues can generate monitoring evaluations. Latitude creates a script that watches for that failure pattern on live traffic, producing more scores.

3. **Alignment**: Annotation scores are compared against evaluation scores for the same traces. This produces [alignment metrics](../evaluations/alignment) that tell you how well automated evaluations match human judgment.

4. **Analytics**: Finalized scores feed into time-series dashboards showing quality trends across your project.

## Next Steps

- [Annotations](../annotations/overview): How human reviewers create scores through annotation workflows
- [Evaluations](../evaluations/overview): How automated scripts create scores
- [Issues](../issues/overview): How failed scores become trackable failure patterns
- [Analytics](./analytics): Visualizing score trends
- [Scores API](./api): Submit custom scores and annotations programmatically
