---
title: Annotations Overview
description: Understand how human review workflows produce scores in Latitude
---

# Annotations Overview

Annotations are the human review workflow in Latitude. When your team reviews a trace and provides feedback, that's an annotation. Each annotation produces a [score](../scores/overview) — the universal measurement unit that feeds into issues, alignment, and analytics.

## What Is an Annotation

An annotation is a human reviewer's verdict on a trace. Each annotation includes:

| Field | Description |
| --- | --- |
| **Verdict** | Positive (thumbs up) or negative (thumbs down) |
| **Feedback** | Free-text explanation of the reviewer's assessment |
| **Scope** | Conversation-level or message-level (attached to a specific message) |
| **State** | Draft or published |
| **Issue link** | Optional link to an existing issue or creation of a new one |
| **Reviewer** | The team member who created the annotation |

When published, an annotation becomes a score with `source = "annotation"` that feeds into analytics, issue discovery, and evaluation alignment.

## Why Annotations Matter

Automated evaluations can monitor thousands of traces per hour, but they can only be as good as the human judgment they're calibrated against. Annotations serve three critical functions:

### Ground Truth for Alignment

When both an evaluation and a human have scored the same trace, Latitude computes [alignment metrics](../evaluations/alignment) (MCC, confusion matrix, agreement rate). Without annotations, you have no way to know if your evaluations are actually correct.

### Issue Validation

When Latitude discovers an issue from evaluation failures, human annotations confirm whether the detection is accurate. Annotations on issue-linked traces tell you:

- Are the automatically detected failures real problems?
- Is the evaluation too strict or too lenient?
- Are there nuances the evaluation is missing?

### Rich Feedback

Annotations capture *why* an interaction was good or bad in the reviewer's own words. This qualitative feedback is invaluable for:

- Understanding failure modes that automated evaluations can't articulate
- Training new team members on quality expectations
- Informing evaluation script improvements

## Draft vs. Published

Annotations start as **drafts**. A draft annotation is visible only to its creator and doesn't produce a finalized score yet. This allows reviewers to:

- Work through a queue at their own pace
- Revise their assessment before finalizing
- Start annotations and come back to them later

When a reviewer publishes an annotation, the underlying score is finalized — it becomes visible to the team and feeds into analytics, issue discovery, and alignment. Once finalized, the score is immutable.

## Annotation Workflow

The typical annotation workflow in Latitude:

1. **Traces enter annotation queues** — Either automatically (through queue filters) or manually (through bulk selection)
2. **Reviewers open queue items** — They see the full conversation and any existing scores
3. **Reviewers create annotations** — They mark interactions as positive or negative with feedback
4. **Annotations produce scores** — Published annotations become finalized scores
5. **Scores drive improvements** — They power analytics, issue discovery, and evaluation alignment

## Next Steps

- [Annotation Queues](./annotation-queues) — Managed review backlogs for systematic annotation
- [Inline Annotations](./inline-annotations) — Annotating directly from trace views
- [Scores](../scores/overview) — How the universal score model works
- [Evaluation Alignment](../evaluations/alignment) — How annotations calibrate automated evaluations
