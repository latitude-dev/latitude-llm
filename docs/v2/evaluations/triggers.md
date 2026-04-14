---
title: Evaluation Triggers
description: Configure which traces an evaluation runs against and when
---

# Evaluation Triggers

Every evaluation has a **trigger configuration** that determines which traces it evaluates and how. Triggers give you precise control over what an evaluation monitors without modifying the evaluation script itself.

## How Triggers Work

When a trace completes (after a debounce window with no new spans), Latitude checks it against every active evaluation's trigger configuration. Trigger checks are evaluated in a specific order:

1. **Filter** — Does the trace match the evaluation's filter criteria?
2. **Sampling** — Does it pass the sample rate check?
3. **Turn / Debounce** — Which turn does the evaluation target, and should execution be debounced?

If a trace passes all checks, the evaluation runs. If it fails at any stage, it's skipped.

Triggers use the same **shared filter system** as the trace view and annotation queues. This means the filtering capabilities you see in the trace dashboard are the same ones available for evaluation triggers.

## Trigger Fields

### Filter

Select which traces the evaluation monitors using any combination of the shared filters:

- **Status** — Only evaluate traces with errors, or only successful traces
- **Models** — Only evaluate traces that used specific models
- **Providers** — Only evaluate traces from specific providers
- **Tags** — Only evaluate traces with specific tags
- **Cost** — Only evaluate traces above or below a cost threshold
- **Duration** — Only evaluate traces above or below a duration threshold
- **Custom metadata** — Filter on any `metadata.*` fields your application sends

An empty filter means "match all traces."

### Sampling

The percentage of matching traces that the evaluation actually runs against, from 0 to 100. This controls cost and processing time while still giving you statistical coverage.

- Setting sampling to `0` effectively **pauses** the evaluation.
- New evaluations generated from issues default to `10%` sampling.

### Turn

Controls which trace or turn the evaluation runs on:

- **`every`** — Run on every completed trace (the default)
- **`first`** — Run only on the first trace/turn in a session
- **`last`** — Run only on the last trace/turn in a session

This is useful when your evaluation only makes sense at the start or end of a conversation.

### Debounce

A debounce time in seconds. When set, the evaluation waits for the debounce period after the trace completes before executing. This is useful for batching or rate-limiting evaluation execution.

## Trigger Examples

**Monitor all production traces for jailbreak attempts:**

- Filter: metadata `environment` = "production"
- Sampling: 100%
- Turn: every
- Debounce: 0

**Spot-check expensive traces for quality:**

- Filter: cost > $0.50
- Sampling: 25%
- Turn: every
- Debounce: 0

**Evaluate only the last turn of each session:**

- Filter: (empty — match all)
- Sampling: 10%
- Turn: last
- Debounce: 0

## Triggers and Annotation Queues

Triggers work in concert with annotation queues. A common pattern:

1. An evaluation monitors traces with a broad trigger
2. Failed scores feed into issue discovery
3. A linked annotation queue surfaces failing traces for human review
4. Human annotations measure alignment with the evaluation

This creates a feedback loop where triggers determine the scope of automated monitoring, and annotation queues determine the scope of human oversight.

## Next Steps

- [Alignment](./alignment) — How human annotations calibrate evaluations
- [Evaluations Overview](./overview) — How evaluation scripts work
- [Annotation Queues](../annotations/annotation-queues) — The human side of the feedback loop
