---
title: Evaluation Alignment
description: Measure how well your automated evaluations agree with human judgment
---

# Evaluation Alignment

Alignment measures how closely your automated evaluations match human judgment. It answers a critical question: **Can you trust your evaluations?**

## Why Alignment Matters

Automated evaluations are only useful if they agree with what a human reviewer would say. Without alignment tracking:

- You don't know if an evaluation is too strict or too lenient
- You can't detect when an evaluation starts disagreeing with reality
- You have no signal for when to recalibrate your evaluation scripts

Alignment gives you that signal. When alignment drops, it's time to review your evaluation scripts and update them based on recent human annotations.

## How Alignment Works

Alignment is computed when both an **evaluation** and a **human annotation** have scored the same trace. Latitude compares their pass/fail verdicts and computes several metrics:

### Matthews Correlation Coefficient (MCC)

MCC is the primary alignment metric. It's a balanced measure that works well even when pass/fail rates are imbalanced. MCC ranges from -1 to +1:

| MCC Range | Interpretation |
| --- | --- |
| 0.7 to 1.0 | Strong alignment — evaluation reliably matches human judgment |
| 0.4 to 0.7 | Moderate alignment — evaluation is useful but has blind spots |
| 0.0 to 0.4 | Weak alignment — evaluation needs recalibration |
| Below 0.0 | Negative correlation — evaluation is systematically wrong |

### Confusion Matrix

The confusion matrix breaks down agreement into four categories:

- **True Positive** — Both evaluation and human say "pass"
- **True Negative** — Both say "fail"
- **False Positive** — Evaluation says "pass" but human says "fail" (evaluation is too lenient)
- **False Negative** — Evaluation says "fail" but human says "pass" (evaluation is too strict)

This tells you the *direction* of disagreement, not just the magnitude.

### Agreement Rate

The simple percentage of traces where evaluation and human agree. Less informative than MCC (it doesn't account for class imbalance) but easy to understand.

## Viewing Alignment

Each evaluation's detail page shows alignment metrics when annotation data exists. You'll see:

- Current MCC and trend over time
- Confusion matrix for the selected time period
- Agreement rate
- Number of overlapping annotations (traces annotated by both evaluation and human reviewer)

## Building Alignment

To get meaningful alignment metrics, you need overlapping annotations — traces that have been annotated by both an evaluation and a human reviewer. Here's how:

1. **Create an annotation queue** that surfaces traces the evaluation has scored
2. **Have reviewers annotate** those traces independently
3. **Compare results** on the evaluation's alignment dashboard

The more overlapping annotations you accumulate, the more reliable your alignment metrics become. Latitude recommends at least 50 overlapping annotations before drawing conclusions from alignment data.

## Improving Alignment

When alignment is low:

1. **Review the confusion matrix** — Is the evaluation too strict or too lenient?
2. **Examine false positives and false negatives** — Look at specific traces where the evaluation and human disagree. What did the evaluation miss?
3. **Update the evaluation script** — Adjust the logic, prompts, or thresholds based on what you learned
4. **Re-annotate** — After updating the evaluation, have reviewers annotate new traces to verify alignment improved

This is the "Align" step of the reliability loop in action.

## Next Steps

- [Annotations](../annotations/overview) — How human review produces the ground truth for alignment
- [Annotation Queues](../annotations/annotation-queues) — Building focused review backlogs
- [Issues](../issues/overview) — How failed evaluations become trackable issues
