---
title: Annotation Queues
description: Build managed review backlogs for systematic human feedback
---

# Annotation Queues

Annotation queues are managed review backlogs that route traces to human reviewers. They provide structure and focus for your team's annotation efforts, ensuring the most valuable traces get reviewed first.

## What Is an Annotation Queue

An annotation queue is a collection of traces waiting for human review, with configuration that controls:

- **Which traces enter the queue** — Filter criteria and curation rules
- **Who reviews them** — Assigned reviewers from your team
- **What reviewers see** — The review interface and context

Each queue has a name, description, and configuration. Queues are scoped to a project.

## Types of Annotation Queues

### System Queues

Every project starts with **default system queues** that automatically classify traces against common failure categories:

- **Jailbreaking** — Attempts to bypass safety constraints
- **Refusal** — The agent refuses requests it should handle
- **Frustration** — Clear user dissatisfaction
- **Forgetting** — The agent loses conversation context
- **Laziness** — The agent avoids doing the requested work
- **NSFW** — Inappropriate content
- **Tool Call Errors** — Failed tool invocations
- **Resource Outliers** — Unusually high latency or cost

System queues use LLM-based classification to automatically detect traces that might have these problems. They provide an out-of-the-box quality signal without any configuration.

### Live Queues

**Live queues** automatically add traces as they complete. You configure:

- **Filters** — Which traces should enter the queue (using the shared filter system)
- **Sample rate** — What percentage of matching traces to include
- **Reviewers** — Which team members should review this queue

Live queues are ideal for continuous monitoring workflows:

- "Review 10% of all production traces for general quality"
- "Review all traces where the jailbreak evaluation fired"
- "Review all traces with cost > $1.00"

### Manual Queues

**Manual queues** are populated by your team selecting traces from the trace view and adding them to the queue. Use manual queues for:

- Ad-hoc investigations ("Review all traces from this customer's session")
- Issue deep-dives ("Review traces where this specific issue was detected")
- Targeted annotation campaigns ("Build training data for this new evaluation")

## The Review Experience

When a reviewer opens a queue, they see a focused review interface:

1. **Left panel** — Metadata, existing annotations, and issue links for the current trace
2. **Center panel** — The full conversation between user and agent
3. **Right panel** — Annotation creation area

The reviewer works through the queue sequentially:

1. Read the conversation
2. Create one or more annotations (conversation-level or message-level)
3. Optionally link annotations to issues
4. Mark the trace as "Fully Annotated" to move to the next item

### Keyboard Shortcuts

The review interface supports keyboard navigation for efficient annotation:

- Arrow keys or `j`/`k` to move between queue items
- Quick-select shortcuts for common verdicts

## Queue Metrics

Each queue tracks:

- **Total items** — How many traces are waiting for review
- **Reviewed items** — How many have been fully annotated
- **Completion rate** — Percentage of the queue that's been reviewed
- **Review velocity** — How quickly items are being reviewed

## Queues and Evaluation Alignment

A powerful pattern for improving evaluation alignment:

1. Create a live queue filtered to traces where a specific evaluation has produced annotations
2. Have reviewers annotate those traces independently
3. Check the evaluation's alignment dashboard — it now has overlapping human and machine annotations
4. Use the alignment metrics to identify where the evaluation needs improvement

This systematic approach to generating alignment data ensures your evaluations stay calibrated over time.

## Next Steps

- [Inline Annotations](./inline-annotations) — Annotating outside of queues
- [Annotations Overview](./overview) — How the annotation system works
- [Evaluation Alignment](../evaluations/alignment) — Using annotations to calibrate evaluations
