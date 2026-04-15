---
title: Annotations Overview
description: Review your agent's interactions and provide human feedback
---

# Annotations

Annotations let your team review traces and leave feedback on your agent's interactions. Each annotation is a thumbs-up or thumbs-down verdict with a text explanation, attached to a conversation or a specific message.

## How to Annotate

Every annotation has the same structure: a **verdict** (positive or negative), **feedback** (why), and an optional **issue link**.

1. **Choose your scope**: Annotate an entire conversation, a single message, or highlight a specific text range within a message
2. **Give a verdict**: Thumbs up if the interaction was good, thumbs down if something went wrong
3. **Write feedback**: Explain what was good or what went wrong. Keep it natural; Latitude enriches short notes with conversation context automatically so they work well for issue clustering
4. **Optionally link an issue**: Associate your annotation with a known issue, or leave it on automatic and let Latitude match it during issue discovery

Annotations save as drafts immediately (so you won't lose work if the page refreshes) and finalize automatically after 5 minutes of inactivity. Once finalized, they become permanent.

## Where to Annotate

There are two places to annotate in Latitude:

### Annotation Queues

[Annotation queues](./annotation-queues) are managed review backlogs. Traces are routed to a queue either automatically (through filters and sampling) or manually (by selecting traces from the dashboard). Queues provide:

- A focused review interface with instructions, conversation context, and annotation controls side by side
- Progress tracking so you know how much of the backlog has been reviewed
- Sequential navigation to work through traces efficiently

Use queues for systematic review work, like reviewing a random sample of production traffic or investigating traces flagged by a specific evaluation.

### Inline from Trace Views

You can also [annotate any trace directly](./inline-annotations) from its detail view. Just open a trace and use the annotation panel on the right side. This is best for:

- Quick spot checks while browsing traces
- Adding feedback to a trace you're already investigating
- Ad-hoc observations that don't fit into a queue workflow

## Why Annotate

Annotations are the foundation of Latitude's reliability loop. They serve three purposes:

- **Calibrate evaluations**: When both a human and an evaluation have scored the same trace, Latitude computes [alignment metrics](../evaluations/alignment) that show whether the evaluation agrees with human judgment. Without annotations, you have no way to know if your automated evaluations are actually correct.

- **Validate issues**: When Latitude discovers an issue from evaluation failures, annotations from your team confirm whether those detections are real problems or false positives.

- **Capture qualitative feedback**: Annotations record _why_ something was good or bad in the reviewer's own words, providing context that automated scores alone can't capture.

## How Annotations Connect to Other Features

| Feature                                    | Relationship                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **[Scores](../scores/overview)**           | Each annotation produces a score that feeds into analytics and dashboards                                             |
| **[Issues](../issues/overview)**           | Failed annotations enter the issue discovery pipeline, where similar failures are clustered into trackable issues     |
| **[Evaluations](../evaluations/overview)** | Annotations provide ground truth for measuring evaluation accuracy                                                    |
| **[Alignment](../evaluations/alignment)**  | When human and machine scores overlap on the same traces, Latitude computes alignment metrics (MCC, confusion matrix) |

## Next Steps

- [Annotation Queues](./annotation-queues): Set up managed review backlogs
- [Inline Annotations](./inline-annotations): Annotate directly from trace views
- [Evaluation Alignment](../evaluations/alignment): See how annotations calibrate your evaluations
