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

Alignment is computed when both an **evaluation** and a **human annotation** have scored the same trace. Latitude compares their pass/fail verdicts and computes metrics from a stored **confusion matrix**.

The only persisted alignment primitive is the confusion matrix — all derived metrics (MCC, accuracy, F1) are computed from those stored counts on read.

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

This tells you the *direction* of disagreement, not just the magnitude. Accuracy and F1 are also derivable from the same counts.

## Viewing Alignment

Each evaluation's detail page shows alignment metrics when annotation data exists. You'll see:

- Current MCC and trend over time
- Confusion matrix for the selected time period
- Last aligned timestamp
- A manual realignment button

## Alignment and Evaluation Generation

When you generate an evaluation from an issue, alignment is core to the generation process:

1. Latitude collects annotation-derived ground truth — at least one failed, non-draft, non-errored annotation linked to the issue (positive examples), plus available negative examples
2. The optimizer generates candidate scripts and evaluates them against this ground truth
3. The best script is selected based on ordered objectives: maximize MCC, then minimize cost, then minimize duration
4. The confusion matrix is stored on the evaluation

There is no minimum negative-example count. A monitor can be created from a single positive occurrence, and its alignment may be weak at first. As users add more annotations, automatic realignment improves the monitor over time.

## Automatic Realignment

Once an evaluation exists, Latitude keeps it calibrated:

- **Incremental refresh** — When the script hash hasn't changed, new examples are evaluated and added to the existing confusion matrix
- **Full re-optimization** — When alignment (MCC) degrades beyond a tolerance threshold, the optimizer runs a full pass
- **Debounced scheduling** — Metric recomputation at most once per hour; full re-optimization at most once every eight hours
- **Manual realignment** — Available from the evaluation dashboard, rate-limited

## Improving Alignment

When alignment is low:

1. **Review the confusion matrix** — Is the evaluation too strict or too lenient?
2. **Examine false positives and false negatives** — Look at specific traces where the evaluation and human disagree. What did the evaluation miss?
3. **Add more annotations** — More human-reviewed traces give the optimizer better signal for realignment
4. **Trigger manual realignment** — After adding annotations, use the realignment button to refresh

This iterative calibration process is how you keep automated evaluations trustworthy over time.

## Next Steps

- [Annotations](../annotations/overview) — How human review produces the ground truth for alignment
- [Annotation Queues](../annotations/annotation-queues) — Building focused review backlogs
- [Issues](../issues/overview) — How failed evaluations become trackable issues
