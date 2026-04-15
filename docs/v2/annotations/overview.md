---
title: Annotations Overview
description: Understand how human review workflows produce scores in Latitude
---

# Annotations Overview

Annotations are the human review workflow in Latitude. When your team reviews a trace and provides feedback, that's an annotation. Each annotation produces a [score](../scores/overview): the universal measurement unit that feeds into issues, alignment, and analytics.

## What Is an Annotation

An annotation is a human reviewer's verdict on a trace. Each annotation includes:

| Field | Description |
| --- | --- |
| **Verdict** | Positive (thumbs up) or negative (thumbs down) |
| **Feedback** | Free-text explanation of the reviewer's assessment |
| **Scope** | Conversation-level or message-level (attached to a specific message or text range) |
| **State** | Draft or finalized |
| **Issue link** | Optional link to an existing issue |
| **Reviewer** | The team member who created the annotation |

When finalized, annotations feed into analytics, issue discovery, and evaluation alignment alongside all other scores.

## Why Annotations Matter

Automated evaluations can monitor thousands of traces per hour, but they can only be as good as the human judgment they're calibrated against. Annotations serve three critical functions:

### Ground Truth for Alignment

When both an evaluation and a human have scored the same trace, Latitude computes [alignment metrics](../evaluations/alignment) (MCC, confusion matrix). Without annotations, you have no way to know if your evaluations are actually correct.

### Issue Validation

When Latitude discovers an issue from evaluation failures, human annotations confirm whether the detection is accurate. Annotations on issue-linked traces tell you:

- Are the automatically detected failures real problems?
- Is the evaluation too strict or too lenient?
- Are there nuances the evaluation is missing?

### Rich Feedback

Annotations capture *why* an interaction was good or bad in the reviewer's own words. This qualitative feedback is valuable for understanding failure modes and informing evaluation improvements.

#### Feedback Enrichment

Raw annotation feedback is often short: things like "bad answer" or "wrong price." These brief notes are valuable but don't cluster well for issue discovery.

To solve this, Latitude enriches annotation feedback before using it for issue clustering:

1. **Your original text is always preserved** in the score's metadata. It's never lost or overwritten
2. **The canonical feedback field** is enriched with surrounding conversation context (what the user asked, what the agent said, what went wrong)
3. **Issue discovery uses the enriched version** for semantic similarity and text matching, so short human notes still cluster with related failures

This means you can write quick, natural feedback during annotation without worrying about phrasing it perfectly for the system.

## Draft vs. Finalized

Annotations start as **drafts**. A draft annotation:

- Is written to Postgres immediately so it persists across page refreshes
- Is visible in draft-aware surfaces like queue review and in-progress editing
- Does not participate in analytics, issue discovery, or evaluation alignment
- Can be edited and revised while the draft is still active

Draft finalization happens automatically after a debounced timeout: by default, 5 minutes after the last edit. This gives reviewers time to revise without requiring an explicit "publish" action.

System-created queue drafts (proposed by Latitude's classification system) do not auto-finalize. They wait for explicit human review.

Once finalized, a score becomes immutable. It can be deleted later but should not be edited.

## Issue Intent

When creating an annotation through Latitude's UI, the annotator can:

- **Leave issue assignment automatic**: Let Latitude's discovery pipeline decide which issue the annotation belongs to (or create a new one)
- **Link to an existing issue**: Explicitly associate the annotation with a known failure pattern, bypassing automatic discovery for that score

Explicit link choices are human overrides that take effect when the draft is finalized.

## Annotation Workflow

The typical annotation workflow in Latitude:

1. **Traces enter annotation queues**: Either automatically (through queue filters or system classification) or manually (through bulk selection)
2. **Reviewers open queue items**: They see the full conversation and any existing scores
3. **Reviewers create annotations**: They mark interactions as positive or negative with feedback
4. **Drafts finalize automatically**: After the debounce timeout, annotations become immutable scores
5. **Scores drive improvements**: They power analytics, issue discovery, and evaluation alignment

## Next Steps

- [Annotation Queues](./annotation-queues): Managed review backlogs for systematic annotation
- [Inline Annotations](./inline-annotations): Annotating directly from trace views
- [Scores](../scores/overview): How the universal score model works
- [Evaluation Alignment](../evaluations/alignment): How annotations calibrate automated evaluations
