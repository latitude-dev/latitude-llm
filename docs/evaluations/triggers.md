---
title: Evaluation triggers
description: Configure which sessions an evaluation runs on, and how many.
---

# Evaluation triggers

An evaluation's trigger decides which sessions it runs on and how many of them. It controls monitoring scope and cost without changing how the evaluation decides a match.

## Scope: which sessions to check

By default an evaluation runs on every session in your project. Narrow it with filters. When you [create a signal](../signals/create), the Scope step offers these dimensions:

- Tags
- Services
- Models
- Providers
- Metadata (any `metadata.*` key your app sends)

With filters set, only matching sessions run through the evaluation, and everything else is skipped. An empty filter means every session.

Scope uses the same shared filter system as trace views and [saved searches](../search/saved-searches), so a filter you build for search translates directly to an evaluation's scope. You can also open the builder pre-scoped from a search, using "Create signal from this search."

## Sampling: how many to check

Sampling is the percentage of matching sessions the evaluation actually runs on, from 0 to 100.

- It defaults to 10 percent for a new signal.
- Setting it to 0 pauses the evaluation. The configuration is kept, but no sessions are checked.
- A [set of conditions](./detection-methods#set-of-conditions) is free and instant, so 100 percent is usually fine. An LLM judge, or a script that calls an LLM, costs money and time per check, so a lower rate keeps costs down while still catching the pattern on a high-traffic project.

## Timing

Latitude runs an evaluation as sessions complete, so it acts on finished work rather than partial executions. The exact turn it runs on, and any debouncing for multi-turn sessions, are handled for you. You set the scope and the sampling rate, and Latitude manages the rest.

## Scope, search, and annotations

Scope and sampling control automated monitoring. [Search](../search/overview) and [annotations](../annotations/overview) cover human review: use search to inspect relevant sessions, then annotate the ones that need human judgment for alignment or discovery. [Flaggers](../annotations/flaggers) add automatic signal for a fixed list of common categories.

## Next steps

- [Detection methods](./detection-methods): how an evaluation decides a match
- [Alignment](./alignment): how human annotations calibrate evaluations
- [Evaluations overview](./overview): how evaluations work
- [Search](../search/overview): build cohorts of sessions to review
