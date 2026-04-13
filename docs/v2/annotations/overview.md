---
title: Annotations Overview
description: Understand how annotations work as the fundamental unit of measurement in Latitude V2
---

# Annotations Overview

Annotations are the fundamental unit of measurement in Latitude V2. Every verdict on your agent's interactions — whether from an automated evaluation, a human reviewer, or your own code — is an annotation.

## What Is an Annotation

An annotation is a quantitative verdict attached to a trace. Every annotation has:

| Field | Description |
| --- | --- |
| **Value** | A number between 0 and 1 (normalized from the source's raw output) |
| **Pass / Fail** | A boolean derived from the value: `true` if ≥ 0.5, `false` otherwise |
| **Feedback** | A human-readable string explaining the verdict |
| **Source** | Where the annotation came from: `evaluation`, `human`, or `custom` |
| **Trace** | The trace this annotation measures |

Annotations are always associated with a **trace** (and through the trace, optionally a session). Annotations can also be associated with a specific **span** within a trace, allowing fine-grained measurement of individual operations.

## Why Annotations Are Normalized

Different sources produce values on different scales:

- An evaluation script might return `true`/`false` or a number between 0 and 100
- A human reviewer might give thumbs up (1) or thumbs down (0)
- A custom annotation from your API might use any range

Latitude normalizes all values to the 0–1 range so they can be compared, aggregated, and trended regardless of source. The **pass/fail** threshold at 0.5 provides a consistent binary signal for issue discovery.

## Annotation Sources

Annotations come from three sources:

### Evaluations

**Evaluation annotations** are produced by automated scripts that run on your traces. When a trace matches an evaluation's trigger configuration, the evaluation runs and produces an annotation.

Evaluation annotations are the primary source for continuous monitoring — they run 24/7 on live traffic and catch issues in real time.

### Human Review

**Human annotations** come from your team reviewing traces. When someone reviews a trace — either through an [annotation queue](./annotation-queues) or [inline from the trace view](./inline-annotations) — their verdict becomes an annotation.

Each human annotation includes:

| Field | Description |
| --- | --- |
| **Verdict** | Positive (thumbs up) or negative (thumbs down) |
| **Feedback** | Free-text explanation of the reviewer's assessment |
| **Scope** | Conversation-level or message-level (attached to a specific message) |
| **State** | Draft or published |
| **Issue link** | Optional link to an existing issue or creation of a new one |
| **Reviewer** | The team member who created the annotation |

Human annotations serve as **ground truth**. They represent what a human actually thinks about the agent's behavior, and they anchor [evaluation alignment](../evaluations/alignment) metrics.

#### Draft vs. Published

Human annotations start as **drafts**. A draft annotation is visible only to its creator and doesn't affect analytics yet. This allows reviewers to:

- Work through a queue at their own pace
- Revise their assessment before finalizing
- Start annotations and come back to them later

When a reviewer publishes an annotation, it becomes visible to the team and enters the reliability pipeline.

### Custom

**Custom annotations** are submitted by your own code through the Latitude API. Use custom annotations when you have domain-specific quality signals:

- **User satisfaction** — Converting thumbs-up/down or NPS into annotations
- **Task completion** — Whether the agent accomplished the user's goal
- **Business metrics** — Conversion rates, resolution rates, escalation rates
- **Downstream validation** — Whether the agent's output was correct (verified after the fact)

## How Sources Interact

The three sources are complementary:

1. **Evaluations** provide breadth — they run on every matching trace automatically
2. **Human review** provides depth — high-confidence human judgment on sampled traces
3. **Custom** provides domain context — connects agent quality to business outcomes

The interplay between evaluations and human annotations is particularly powerful. Human annotations calibrate evaluations. When [alignment](../evaluations/alignment) drifts, you know to review and update your evaluation scripts.

## How Annotations Flow Through the System

Annotations feed forward into the reliability loop:

1. **Issue Discovery**: When annotations fail, Latitude analyzes their feedback to find common patterns. Similar failures are grouped into [issues](../issues/overview) — named, trackable failure patterns.

2. **Evaluation Generation**: Issues can generate monitoring evaluations. When you click "Generate Evaluation" on an issue, Latitude creates a script that watches for that failure pattern on live traffic.

3. **Alignment Tracking**: Human annotations are compared against evaluation annotations for the same traces. This produces [alignment metrics](../evaluations/alignment) — MCC, confusion matrices, agreement rates — that tell you how well your automated evaluations match human judgment.

4. **Analytics**: Annotations power time-series dashboards that show quality trends across your project.

## Next Steps

- [Annotation Queues](./annotation-queues) — Managed review backlogs for systematic human annotation
- [Inline Annotations](./inline-annotations) — Annotating directly from trace views
- [Analytics](./analytics) — Visualizing annotation trends and quality metrics
- [Evaluations](../evaluations/overview) — How automated annotations work
