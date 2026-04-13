---
title: Introduction
description: Welcome to Latitude V2 — the Agent Observability Platform
---

# Introduction

Latitude V2 is an open-source **agent observability platform**. It helps teams turn live agent traffic and human judgment into measurable, improvable quality — so you can ship AI features with confidence.

## What Latitude V2 Does

Latitude V2 gives you a closed-loop system for monitoring, evaluating, and improving AI agents in production:

- **Observe** — Capture every interaction your agents have with users through automatic telemetry. See spans, traces, and sessions in real time.
- **Annotate** — Attach quantitative verdicts to every interaction. Annotations come from automated evaluations, human reviewers, or your own custom logic.
- **Discover** — When annotations indicate failures, Latitude automatically groups similar problems into **issues** — named, trackable failure patterns.
- **Evaluate** — Generate monitoring scripts from discovered issues. These evaluations run continuously on live traffic, catching regressions before users notice.
- **Align** — Keep your automated evaluations honest by measuring how well they agree with human reviewers. Latitude tracks alignment metrics so you know when machine judgment drifts from human judgment.
- **Simulate** — Before shipping changes, run your agent against test scenarios locally or in CI. Reuse the same evaluation scripts that monitor production.
- **Improve** — Use everything you've learned to make your agents better, then repeat.

## The Reliability Loop

The reliability loop is the organizing principle behind Latitude V2. Every feature connects back to this cycle:

```
Observe → Annotate → Discover → Evaluate → Align → Simulate → Improve → Observe
```

Each step feeds the next. Annotations improve evaluation alignment. Better evaluations catch more issues. Issues generate monitors. Monitors validate simulations. Simulations prevent regressions before they reach production.

## Key Concepts

| Concept | What It Is |
| --- | --- |
| **Span** | A single unit of work captured by telemetry (an LLM call, a tool invocation, etc.) |
| **Trace** | A complete interaction from start to finish, composed of one or more spans |
| **Session** | A multi-turn conversation between a user and your agent, composed of related traces |
| **Annotation** | A quantitative verdict on a trace, span, or session — normalized between 0 and 1 |
| **Evaluation** | A script that automatically produces annotations from your agent's interactions |
| **Issue** | A named failure pattern discovered by grouping similar failed annotations |
| **Annotation Queue** | A managed review backlog that routes traces to human reviewers |
| **Simulation** | A test run of your agent against scenarios, evaluated locally or in CI |

## What's New in V2

If you're coming from Latitude V1, here's what's changed:

| V1 | V2 |
| --- | --- |
| Prompt engineering platform | Agent observability platform |
| Evaluations as LLM-as-judge prompts or rules | Evaluations as portable JavaScript scripts |
| Composite scores | Canonical annotations with pass/fail verdicts and feedback |
| Human-in-the-loop as a single evaluation type | Annotations with draft workflows and managed queues |
| Experiments (batch runs) | Simulations (local-first CLI with optional upload) |
| No issue tracking | Automatic issue discovery from failure patterns |
| — | Evaluation alignment metrics (MCC, confusion matrix) |

Features that remain available in V1 — such as the Prompt Manager, Playground, AI Gateway, Datasets, and PromptL — are documented in the V1 tab.

## Next Steps

- **Developers**: Follow the [Developer Quick Start](./quick-start-dev) to connect your first agent and see traces in Latitude.
- **Team leads and PMs**: Follow the [No-Code Quick Start](./quick-start-pm) for a walkthrough of the Latitude web UI.
