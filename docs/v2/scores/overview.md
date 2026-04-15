---
title: Scores Overview
description: Understand how scores work as the universal measurement unit in Latitude
---

# Scores

Scores are the universal measurement unit in Latitude. Every verdict on your agent's interactions, whether from an automated evaluation, a human annotation, or your own code, is a score. Everything in Latitude's reliability system is built on top of scores: issues, evaluation dashboards, annotation workflows, simulations, and analytics.

## What Is a Score

A score is a verdict attached to a trace. Every score has:

| Field           | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| **Value**       | A number between 0 and 1                                     |
| **Pass / Fail** | Whether the interaction met expectations                     |
| **Feedback**    | Text explaining the verdict                                  |
| **Source**      | Where the score came from: evaluation, annotation, or custom |

Scores can also carry resource usage fields like duration, token count, and cost.

Scores are always associated with a **trace**. They can optionally be associated with a specific **span**, a **session**, a **simulation**, or an **issue**.

## Score Sources

Every score has a source that identifies how it was produced:

### Evaluation Scores

Produced by automated scripts that Latitude runs on your traces. When a trace matches an evaluation's trigger configuration, the evaluation executes and writes a score.

Evaluation scores are the backbone of continuous monitoring: they run on every matching trace automatically, giving you real-time quality visibility.

### Annotation Scores

Produced by human reviewers. When someone annotates a trace through an [annotation queue](../annotations/annotation-queues) or [inline from the trace view](../annotations/inline-annotations), their verdict becomes a score.

Annotation scores serve as **ground truth**. They represent what a human actually thinks about the agent's behavior and anchor [evaluation alignment](../evaluations/alignment) metrics.

### Custom Scores

Submitted by your own code through the [Latitude API](./api). Use custom scores for domain-specific quality signals:

- User satisfaction ratings
- Task completion metrics
- Business KPIs (conversion rates, resolution rates)
- Downstream validation (was the agent's output actually correct?)

## How Scores Work

Scores from human annotations start as **drafts**. A draft score:

- Persists immediately so it survives page refreshes
- Is visible in annotation queue review and in-progress editing
- Does not appear in analytics, issue discovery, or alignment metrics
- Can be edited and revised while still in draft state

Drafts are finalized automatically after a quiet period (default: 5 minutes after the last edit). System-created drafts (from automatic queue classification) wait for explicit human review before finalization.

Once a score is finalized, it becomes permanent and cannot be edited.

## How Scores Flow Through the System

Scores feed forward into every part of Latitude:

1. **Issue Discovery**: When scores fail, Latitude groups similar failures into [issues](../issues/overview): named, trackable failure patterns your team can investigate and resolve.

2. **Evaluation Generation**: Issues can generate monitoring evaluations that watch for that failure pattern on live traffic, producing more scores.

3. **Alignment**: Annotation scores are compared against evaluation scores for the same traces, producing [alignment metrics](../evaluations/alignment) that tell you how well automated evaluations match human judgment.

4. **Analytics**: Finalized scores feed into time-series dashboards showing quality trends across your project.

## Next Steps

- [Annotations](../annotations/overview): How human reviewers create scores
- [Evaluations](../evaluations/overview): How automated scripts create scores
- [Issues](../issues/overview): How failed scores become trackable failure patterns
- [Analytics](./analytics): Visualizing score trends
- [Scores API](./api): Submit custom scores programmatically
