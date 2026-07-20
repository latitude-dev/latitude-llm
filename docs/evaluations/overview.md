---
title: Evaluations overview
description: Understand how evaluations score traffic to monitor your agent's quality over time.
---

# Evaluations overview

An evaluation is an automated detector that scores sessions as they arrive. It watches for one behavior or quality criterion, runs on completed traffic, and produces a [score](../scores/overview) each time it checks a session. Those scores feed the same analytics, signal, and alignment workflows as annotations and flaggers.

Every signal is backed by an evaluation. When a signal's evaluation matches a session, that session joins the signal.

## What an evaluation has

- A name and description: the behavior being detected.
- A detection method: how it decides whether a session matches. See [Detection methods](./detection-methods).
- A trigger: which sessions it runs on, and at what sampling rate. See [Triggers](./triggers).

## How an evaluation runs

1. A session completes in your project.
2. Latitude checks it against each active evaluation's scope and sampling.
3. Matching evaluations score the session.
4. Each returns a pass or fail verdict with feedback, stored as a score.
5. A passing score adds the session to the evaluation's signal.

`passed = true` means the behavior is present, not that the session was good. A signal for a bad behavior passes when that behavior happens.

## Where evaluations come from

An evaluation can be created two ways.

### Generated from a signal

When Latitude discovers a signal, or when you choose to monitor one, it can generate an evaluation from the signal's description, example traces, annotations, and scores. You don't pick the method. Latitude builds a detector from the evidence and keeps it aligned to human judgment over time.

### Defined by you

When you [create a signal](../signals/create) yourself, you define its evaluation directly. You choose one of three [detection methods](./detection-methods):

- Set of conditions: deterministic checks, free and instant.
- LLM as judge: describe the behavior and let an LLM decide.
- Custom script: JavaScript for anything the other two can't express.

A detector you define runs exactly as written. It is not automatically realigned to annotations the way a generated one is. See [Alignment](./alignment).

## Choosing a detection method

Clear structural failures, such as tool errors, empty responses, or latency over a limit, are a good fit for a set of conditions. Semantic behavior, such as relevance, tone, or whether an answer resolved the request, usually needs an LLM judge. When neither fits, a custom script gives you full control. See [Detection methods](./detection-methods) for the full catalog.

## Evaluation lifecycle

- Active: scoring matching sessions in real time.
- Paused: sampling set to `0`, configuration preserved.
- Archived: read-only and no longer scoring new sessions.
- Deleted: removed from management views, while historical results stay in analytics.

## Next steps

- [Detection methods](./detection-methods): the three ways an evaluation decides
- [Custom scripts](./custom-scripts): the scripting reference
- [Triggers](./triggers): scope and sampling
- [Alignment](./alignment): how evaluations stay calibrated to human judgment
- [Signals](../signals/overview): how evaluation matches become tracked signals
