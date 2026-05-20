---
title: Scores Overview
description: Understand how scores work as the universal measurement unit in Latitude
---

# Scores

Scores are Latitude's common measurement unit. Every verdict on an agent interaction—from an evaluation, annotation, flagger, or your own code—is stored as a score. Issues, evaluation dashboards, annotation workflows, and analytics all build on this model.

## What Is a Score

A score is a verdict attached to a trace. Every score has:

| Field | Description |
| --- | --- |
| **Value** | A number between 0 and 1 |
| **Pass / Fail** | Whether the interaction met expectations |
| **Feedback** | Text explaining the verdict |
| **Source** | Where the score came from: evaluation, annotation, or custom |

Scores can also carry resource fields such as duration, token count, and cost.

A score is always associated with a **trace**. It can also be associated with a **span**, **session**, **simulation**, or **issue**.

## Score Sources

### Evaluation Scores

Automated monitors create evaluation scores when a trace matches an evaluation's trigger configuration. These scores power continuous monitoring and show how quality changes over time.

### Annotation Scores

Human reviewers and built-in [flaggers](../annotations/flaggers) create annotation scores. They serve as ground truth for [evaluation alignment](../evaluations/alignment) and provide feedback for issue discovery.

### Custom Scores

Your own code can submit custom scores through the [Latitude API](./api). Use them for domain-specific signals such as satisfaction ratings, task completion, conversion, resolution rate, or downstream validation.

## Drafts and Finalized Scores

Human annotations can start as drafts while you edit them. Drafts are visible in the trace's annotation panel but do not feed analytics, issue discovery, or alignment until they are finalized.

Once finalized, a score becomes part of Latitude's reliability workflows.

## How Scores Flow Through Latitude

Finalized scores feed into:

1. **Issue discovery**: Failed scores can become named, trackable [issues](../issues/overview).
2. **Evaluation generation**: Issues can generate monitors that produce more scores on live traffic.
3. **Alignment**: Annotation scores are compared with evaluation scores on the same traces.
4. **Analytics**: Score dashboards show quality trends across your project.

## Next Steps

- [Annotations](../annotations/overview): How human reviewers create scores
- [Evaluations](../evaluations/overview): How automated monitors create scores
- [Issues](../issues/overview): How failed scores become trackable failure patterns
- [Analytics](./analytics): Visualize score trends
- [Scores API](./api): Submit custom scores programmatically
