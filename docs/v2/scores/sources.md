---
title: Score Sources
description: Understand where scores come from — evaluations, annotations, and custom sources
---

# Score Sources

Every score in Latitude has a **source** that identifies how it was produced. Understanding sources helps you interpret scores correctly and build effective quality workflows.

## Evaluation Scores

**Source**: `evaluation`

Evaluation scores are produced by automated scripts that Latitude runs on your traces. Each evaluation is a JavaScript-like function that receives a trace's messages and metadata, then returns a verdict.

An evaluation score records:

- The **evaluation** that produced it (name, version, script)
- The **trace** it was run against
- A **value** between 0 and 1
- A **pass/fail** verdict (value ≥ 0.5 passes)
- **Feedback** text describing the verdict

Evaluation scores are the backbone of continuous monitoring. They run automatically whenever a matching trace completes, giving you real-time visibility into quality regressions.

When evaluation scores fail, they feed into the **issue discovery** system. Similar failures are grouped into issues, closing the loop from observation to action.

## Annotation Scores

**Source**: `annotation`

Annotation scores come from human reviewers. When someone annotates a trace — either through an annotation queue or inline from the trace view — their verdict becomes a score.

An annotation score records:

- The **annotation** that produced it (reviewer, timestamp, draft/published state)
- The **trace** it was attached to
- A **value** — thumbs up (1.0) or thumbs down (0.0) by default
- A **pass/fail** verdict
- **Feedback** text from the reviewer

Annotation scores serve as **ground truth**. They represent what a human actually thinks about the agent's behavior.

### Annotations vs. Annotation Scores

It's worth noting the distinction:

- An **annotation** is the act of a human reviewing a trace and providing feedback. Annotations can be drafts or published, and they include the reviewer's identity.
- A **score** is the quantitative record produced by that annotation — it enters the same scoring pipeline as evaluations and custom scores, with normalized values and pass/fail verdicts.

This means annotation results appear in the same dashboards, trends, and alignment metrics as automated evaluation scores.

### Alignment

When both an evaluation and a human reviewer have scored the same trace, Latitude can compare them. This produces **alignment metrics**:

- **MCC (Matthews Correlation Coefficient)** — How well binary pass/fail predictions correlate
- **Confusion matrix** — True positives, false positives, true negatives, false negatives
- **Agreement rate** — Simple percentage of matching verdicts

Low alignment tells you that your automated evaluations are drifting from human judgment and need recalibration.

## Custom Scores

**Source**: `custom`

Custom scores are submitted by your own code through the Latitude API. Use custom scores when you have domain-specific quality signals that don't fit neatly into evaluations or annotations.

Common uses for custom scores:

- **User satisfaction** — Converting thumbs-up/down or NPS into scores
- **Task completion** — Whether the agent accomplished the user's goal
- **Business metrics** — Conversion rates, resolution rates, escalation rates
- **Downstream validation** — Whether the agent's output was correct (verified after the fact)

Custom scores participate in the same pipeline as evaluation and annotation scores: they appear on traces, feed into analytics, and contribute to issue discovery.

## How Sources Interact

The three sources are complementary:

1. **Evaluations** provide breadth — they run on every matching trace automatically
2. **Annotations** provide depth — they give high-confidence human judgment on sampled traces
3. **Custom** provides domain context — they connect agent quality to business outcomes

The interplay between evaluations and annotations is particularly powerful. Annotations calibrate evaluations. When alignment drifts, you know to review and update your evaluation scripts.

## Next Steps

- [Score Analytics](./analytics) — Visualizing score trends
- [Evaluations](../evaluations/overview) — How evaluation scripts work
- [Annotations](../annotations/overview) — Human review workflows
