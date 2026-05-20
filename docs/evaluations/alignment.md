---
title: Evaluation Alignment
description: Measure how well your automated evaluations agree with human judgment
---

# Evaluation Alignment

Alignment measures how closely evaluations match human judgment. It answers: **Can you trust this monitor to represent the issue your team cares about?**

## Why Alignment Matters

Evaluations are useful only when they agree with the way your team reviews real traces. Without alignment tracking:

- You may not notice that an evaluation is too strict or too lenient.
- You may miss drift as your agent, users, or product behavior changes.
- You may keep monitoring an issue with outdated examples.

Alignment helps Latitude keep evaluations calibrated over time.

## How Alignment Works

Alignment is computed when an evaluation and a human annotation score the same trace. Latitude compares their verdicts and uses the result as feedback for the monitor.

The goal is not just to display a metric; it is to keep the evaluation close to the latest human-reviewed examples of the issue.

## Viewing Alignment

Each evaluation detail page shows alignment information when enough human-reviewed traces are available. Use it to see whether the evaluation still matches reviewer expectations and where it may be drifting.

## Alignment and Evaluation Generation

When you generate an evaluation from an issue:

1. Latitude collects examples from annotations, issue-linked scores, and trace context.
2. Latitude creates a monitor for the issue pattern.
3. The evaluation is compared against known examples.
4. The monitor is attached to the issue.

A monitor can start from a small amount of evidence. As more annotations and scores arrive, Latitude has more signal to improve it.

## Automatic Realignment

Once an evaluation exists, Latitude can realign it as new annotations, flagger matches, evaluation results, and custom scores arrive. This keeps the monitor matched to the issue as production traffic evolves.

## Improving Alignment

When an evaluation appears misaligned:

1. Review traces where the evaluation and human review disagree.
2. Add annotations with specific feedback.
3. Confirm the issue contains representative examples of the behavior you want to track.
4. Let the new signal improve future realignment.

This process keeps automated monitoring grounded in human judgment.

## Next Steps

- [Annotations](../annotations/overview): How human review produces alignment signal
- [Flaggers](../annotations/flaggers): Automatic annotators that contribute signal
- [Search](../search/overview): Build cohorts of traces to annotate
- [Issues](../issues/overview): How failed evaluations become trackable issues
