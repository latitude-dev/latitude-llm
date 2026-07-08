---
title: Evaluation alignment
description: Measure how well your automated evaluations agree with human judgment.
---

# Evaluation alignment

Alignment measures how closely an evaluation matches human judgment. It answers one question: can you trust this detector to represent the behavior your team cares about?

## Why alignment matters

An evaluation is useful only when it agrees with the way your team reviews real traffic. Without alignment tracking:

- You may not notice that an evaluation is too strict or too lenient.
- You may miss drift as your agent, users, or product change.
- You may keep scoring a behavior against outdated examples.

Alignment helps Latitude keep generated evaluations calibrated over time.

## How alignment works

Alignment is computed when an evaluation and a human annotation score the same trace. Latitude compares their verdicts and uses the result as feedback for the detector. The point is not to display a metric; it is to keep the evaluation close to the latest human-reviewed examples.

## Viewing alignment

Each evaluation detail page shows alignment when enough human-reviewed traces are available. Use it to see whether the evaluation still matches reviewer expectations and where it may be drifting.

## Alignment and generated evaluations

When Latitude generates an evaluation from a signal:

1. It collects examples from annotations, signal-linked scores, and trace context.
2. It builds a detector for the behavior.
3. The detector is compared against known examples.
4. The detector is attached to the signal.

A detector can start from a small amount of evidence. As more annotations and scores arrive, Latitude has more to work with, and it can realign the detector as new annotations, flagger matches, evaluation results, and custom scores come in. This keeps the detector matched to the behavior as production traffic evolves.

## Manually defined detectors

A detector you write when you [create a signal](../signals/create) works differently. It runs exactly as you defined it and is not automatically realigned to annotations. That is deliberate: it does what you specified, and nothing changes it behind your back.

If a detector you defined turns out too strict or too lenient, edit it. Adjust the conditions, rewrite the judge criteria, change a threshold in a script, and preview the change against recent sessions before saving. See [Detection methods](./detection-methods).

## Improving alignment

When a generated evaluation looks misaligned:

1. Review traces where the evaluation and human review disagree.
2. Add annotations with specific feedback.
3. Confirm the signal has representative examples of the behavior.
4. Let the new evidence improve the next realignment.

This keeps automated scoring grounded in human judgment.

## Next steps

- [Annotations](../annotations/overview): how human review produces alignment signal
- [Flaggers](../annotations/flaggers): automatic annotators that contribute signal
- [Detection methods](./detection-methods): the three ways to define a detector
- [Signals](../signals/overview): how evaluation matches become tracked signals
