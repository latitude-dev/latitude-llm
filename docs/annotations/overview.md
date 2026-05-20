---
title: Annotations Overview
description: Review your agent's interactions and provide human feedback
---

# Annotations

Annotations are verdicts on individual traces. A human reviewer, a Latitude flagger, or an external system can attach a thumbs-up or thumbs-down verdict with feedback to a conversation, message, or text range.

Finalized annotations become scores. They feed analytics, issue discovery, and evaluation alignment the same way regardless of where they came from.

## How Annotations Get Created

Annotations can come from:

1. **Inline review** from any trace detail view. See [Inline Annotations](./inline-annotations).
2. **Flaggers** when a trace matches a known failure category such as _jailbreaking_, _frustration_, or _tool call errors_. See [Flaggers](./flaggers).
3. **Your own systems** through the [Annotations API](../scores/api).

## How to Annotate

Every annotation has a **verdict**, **feedback**, and an optional **issue link**.

1. **Choose a scope**: conversation, message, or text range.
2. **Give a verdict**: thumbs up for good behavior, thumbs down when something went wrong.
3. **Write feedback**: explain the reason in natural language.
4. **Optionally link an issue**: choose a known issue, or let Latitude match it during issue discovery.

Human annotations save as drafts while you edit. Once finalized, they become part of the reliability loop.

## Where to Annotate

Open any trace detail view—from Traces, Search, Issues, or Sessions—and use the annotation panel on the right. For batch review, start with a [saved search](../search/saved-searches), then work through the matching traces one at a time.

If you want automatic coverage for known failure categories, use [flaggers](./flaggers). If you are building your own feedback UI, submit annotations through the [Annotations API](../scores/api).

## Why Annotate

Annotations are the foundation of Latitude's reliability loop. They help you:

- **Calibrate evaluations** by comparing automated scores with human judgment. See [Alignment](../evaluations/alignment).
- **Validate issues** by confirming whether discovered failure patterns are real problems.
- **Capture qualitative feedback** that explains why something was good or bad.

## How Annotations Connect to Other Features

| Feature | Relationship |
| --- | --- |
| **[Scores](../scores/overview)** | Each finalized annotation becomes a score for analytics and dashboards. |
| **[Issues](../issues/overview)** | Failed annotations can cluster into trackable issues. |
| **[Evaluations](../evaluations/overview)** | Annotations provide ground truth for measuring evaluation accuracy. |
| **[Search](../search/overview)** | Search and saved searches help you find trace cohorts to review. |
| **[Flaggers](./flaggers)** | Flaggers create automatic annotations for common failure categories. |

## Next Steps

- [Inline Annotations](./inline-annotations): Annotate directly from trace views
- [Flaggers](./flaggers): Automatic annotators for common failure categories
- [Search](../search/overview): Build cohorts to annotate
- [Evaluation Alignment](../evaluations/alignment): See how annotations calibrate evaluations
