---
title: Evaluation Triggers
description: Configure which traces an evaluation runs against and when
---

# Evaluation Triggers

Every evaluation has a **trigger configuration** that determines which traces it evaluates. Triggers give you precise control over what an evaluation monitors without modifying the evaluation script itself.

## How Triggers Work

When a trace completes, Latitude checks it against every active evaluation's trigger configuration. If the trace matches, the evaluation runs. If not, it's skipped.

Triggers use the same **shared filter system** as the trace view and annotation queues. This means the filtering capabilities you see in the trace dashboard are the same ones available for evaluation triggers.

## Configurable Trigger Options

### Trace Filters

Select which traces the evaluation monitors using any combination of the shared filters:

- **Status** — Only evaluate traces with errors, or only successful traces
- **Models** — Only evaluate traces that used specific models
- **Providers** — Only evaluate traces from specific providers
- **Tags** — Only evaluate traces with specific tags
- **Cost** — Only evaluate traces above or below a cost threshold
- **Duration** — Only evaluate traces above or below a duration threshold
- **Custom metadata** — Filter on any metadata fields your application sends

### Sampling

For high-volume projects, you can configure a **sample rate** — the percentage of matching traces that the evaluation actually runs against. This controls cost and processing time while still giving you statistical coverage.

### Batch Frequency

Evaluations can be configured to run:

- **On every trace** — Real-time evaluation as traces complete (default for most evaluations)
- **On a schedule** — Batch evaluation that runs periodically against recent traces

## Trigger Examples

**Monitor all production traces for jailbreak attempts:**

- Filter: metadata `environment` = "production"
- Sample rate: 100%
- Frequency: every trace

**Spot-check expensive traces for quality:**

- Filter: cost > $0.50
- Sample rate: 25%
- Frequency: every trace

**Weekly audit of error traces:**

- Filter: status = "error"
- Sample rate: 100%
- Frequency: weekly batch

## Triggers and Annotation Queues

Triggers work in concert with annotation queues. A common pattern:

1. An evaluation monitors traces with a broad trigger
2. Failed annotations feed into issue discovery
3. A linked annotation queue surfaces failing traces for human review
4. Human annotations measure alignment with the evaluation

This creates a feedback loop where triggers determine the scope of automated monitoring, and annotation queues determine the scope of human oversight.

## Next Steps

- [Alignment](./alignment) — How human annotations calibrate evaluations
- [Evaluations Overview](./overview) — How evaluation scripts work
- [Annotation Queues](../annotations/annotation-queues) — The human side of the feedback loop
