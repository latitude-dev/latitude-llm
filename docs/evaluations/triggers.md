---
title: Evaluation Triggers
description: Configure which traces an evaluation runs against and when
---

# Evaluation Triggers

Every evaluation has a **trigger configuration** that determines which traces it evaluates. Triggers control monitoring scope without changing the evaluation's detection strategy.

## How Triggers Work

When a trace completes, Latitude checks it against each active evaluation's trigger configuration:

1. **Filter**: Does the trace match the evaluation's filter criteria?
2. **Sampling**: Should this matching trace be evaluated?
3. **Turn**: Is this the right turn in the session?

If a trace passes all checks, the evaluation runs. Otherwise, it skips that trace.

Triggers use the same **shared filter system** as trace views and saved searches.

## Trigger Fields

### Filter

Select which traces the evaluation monitors using any combination of shared filters:

- **Status**: Errors or successful traces
- **Models**: Specific models
- **Providers**: Specific providers
- **Tags**: Specific tags
- **Cost**: Above or below a cost threshold
- **Duration**: Above or below a duration threshold
- **Custom metadata**: Any `metadata.*` fields your application sends

An empty filter means "match all traces."

### Sampling

The percentage of matching traces that the evaluation runs against, from 0 to 100. Sampling controls cost and processing time while preserving coverage.

- Setting sampling to `0` effectively pauses the evaluation.
- New evaluations generated from issues default to `10%` sampling.

### Turn

Controls which trace or turn the evaluation runs on:

- **`every`**: Run on every completed trace (the default)
- **`first`**: Run only on the first trace or turn in a session
- **`last`**: Run only on the last trace or turn in a session

Use this when an evaluation only makes sense at the start or end of a conversation.

## Trigger Examples

**Monitor all production traces for jailbreak attempts:**

- Filter: metadata `environment` = "production"
- Sampling: 100%
- Turn: every

**Spot-check expensive traces for quality:**

- Filter: cost > $0.50
- Sampling: 25%
- Turn: every

**Evaluate only the last turn of each session:**

- Filter: empty
- Sampling: 10%
- Turn: last

## Triggers, Search, and Annotations

Triggers scope automated monitoring. Search and annotations cover human review: use search to inspect relevant traces, then add annotations when you need human judgment for alignment or issue discovery.

[Flaggers](../annotations/flaggers) provide automatic signal for a fixed list of common categories.

## Next Steps

- [Alignment](./alignment): How human annotations calibrate evaluations
- [Evaluations Overview](./overview): How evaluations work
- [Annotations](../annotations/overview): The human side of the feedback loop
- [Search](../search/overview): Build cohorts of traces to review
