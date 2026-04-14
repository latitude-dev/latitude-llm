---
title: Inline Annotations
description: Annotate traces directly from the trace detail view
---

# Inline Annotations

In addition to annotation queues, you can annotate any trace directly from its detail view. Inline annotations are useful for ad-hoc feedback, quick reviews, and opportunistic quality observations.

## How Inline Annotations Work

When viewing any trace in Latitude:

1. Open the trace detail view by clicking on a trace in the trace table
2. Look for the annotation panel on the right side of the screen
3. Create an annotation:
   - **Conversation-level**: Click the annotation button to assess the overall interaction
   - **Message-level**: Click on a specific message to annotate just that part of the conversation
4. Provide your verdict (thumbs up / thumbs down) and feedback
5. Optionally link the annotation to an issue

Inline annotations follow the same draft → published workflow as queue annotations. They feed into analytics, issue discovery, and evaluation alignment.

## When to Use Inline Annotations

Inline annotations are best for:

- **Quick spot checks** — You're browsing traces and notice something worth flagging
- **Issue investigation** — You're drilling into a specific issue and want to annotate relevant traces
- **Demo and training** — Showing a new team member how annotation works
- **Supplementary feedback** — Adding context to a trace that's already been reviewed in a queue

For systematic, high-volume annotation work, use **annotation queues** instead. Queues provide focused workflows, progress tracking, and ensure coverage.

## Inline Annotations and Issues

When creating an inline annotation, you can:

- **Link to an existing issue** — Associate your annotation with a known failure pattern
- **Create a new issue** — If you've discovered a new failure pattern, create an issue directly from the annotation

This makes inline annotations a discovery mechanism: as you browse traces, you can surface new issues organically.

## Next Steps

- [Annotation Queues](./annotation-queues) — Systematic review workflows
- [Annotations Overview](./overview) — How the annotation system works
- [Issues](../issues/overview) — How annotations connect to issue tracking
