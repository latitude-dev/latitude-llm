---
title: Annotations Overview
description: Review your agent's interactions and provide human feedback
---

# Annotations

Annotations are how humans (and Latitude's built-in flaggers) leave verdicts on individual traces. Each annotation is a thumbs-up or thumbs-down verdict with a text explanation, attached to a conversation or a specific message.

## How Annotations Get Created

There are three ways an annotation appears on a trace:

1. **A human creates it inline** from any trace detail view. See [Inline Annotations](./inline-annotations).
2. **A flagger creates it automatically** when a trace matches a known failure category like _jailbreaking_, _frustration_, or _tool call errors_. See [Flaggers](./flaggers).
3. **An external system submits it through the API** when you're building your own annotation or feedback UI. See the [Annotations API](../scores/api).

All three produce the same kind of artifact: a score with `source = "annotation"` and a `verdict`, `feedback`, and optional `issueId`. Once finalized, an annotation feeds the rest of the reliability system the same way regardless of where it came from.

## How to Annotate

Every annotation has the same structure: a **verdict** (positive or negative), **feedback** (why), and an optional **issue link**.

1. **Choose your scope**: Annotate an entire conversation, a single message, or highlight a specific text range within a message.
2. **Give a verdict**: Thumbs up if the interaction was good, thumbs down if something went wrong.
3. **Write feedback**: Explain what was good or what went wrong. Keep it natural; Latitude enriches short notes with conversation context automatically so they work well for issue clustering.
4. **Optionally link an issue**: Associate your annotation with a known issue, or leave it on automatic and let Latitude match it during issue discovery.

Annotations save as drafts immediately (so you won't lose work if the page refreshes) and finalize automatically after 5 minutes of inactivity. Once finalized, they become permanent.

## Where to Annotate

### From a Trace Detail View

Open any trace, anywhere in the product — from the Traces page, from a search result, from an issue's logs — and use the annotation panel on the right. This is the primary annotation surface.

A common workflow is to build a [saved search](../search/saved-searches) that scopes you to the cohort you want to review, then work through the matching traces one at a time, annotating from the detail view.

See [Inline Annotations](./inline-annotations) for details on the annotation panel and scope choices.

### From a Flagger

Latitude's flaggers run automatically on every completed trace and write annotations directly when they match. You don't have to open a trace for this to happen. See [Flaggers](./flaggers).

### From the API

If you're building your own feedback UI, you can submit annotations programmatically. See the [Annotations API](../scores/api).

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
| **[Search](../search/overview)**           | Search and saved searches are the primary way to scope yourself to a cohort of traces to annotate                     |
| **[Flaggers](./flaggers)**                 | Automatic annotators that handle a fixed list of common failure categories without human review                       |

## Next Steps

- [Inline Annotations](./inline-annotations): Annotate directly from trace views
- [Flaggers](./flaggers): Automatic annotators for common failure categories
- [Search](../search/overview): Build cohorts to annotate
- [Evaluation Alignment](../evaluations/alignment): See how annotations calibrate your evaluations
