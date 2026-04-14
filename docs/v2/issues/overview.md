---
title: Issues Overview
description: Understand how Latitude discovers and tracks failure patterns in your agent
---

# Issues Overview

Issues are named, trackable failure patterns that Latitude discovers automatically from your agent's interactions. They transform scattered evaluation failures into actionable items your team can investigate, monitor, and resolve.

## What Is an Issue

An issue represents a recurring problem with your agent. For example:

- "Agent hallucinates prices when product is out of stock"
- "Agent ignores conversation context after 5+ turns"
- "Agent provides medical advice instead of redirecting to a doctor"

Each issue has:

- **A name** — A concise label for the failure pattern
- **A description** — A longer explanation of what's going wrong and why it matters
- **A lifecycle state** — Where the issue stands: New, Escalating, Resolved, Regressed, or Ignored
- **Linked evaluations** — Automated monitors watching for this specific pattern
- **Occurrence data** — How often the issue has been detected, trended over time

## How Issues Are Discovered

Issue discovery uses **semantic clustering** of failed score feedback. Here's how it works:

1. An evaluation produces a **failing score** on a trace
2. The score includes **feedback** text explaining why it failed
3. Latitude analyzes the feedback alongside other recent failures
4. Failures with **semantically similar feedback** are grouped together
5. When a cluster reaches a threshold, Latitude creates a new **issue**

This means issues emerge naturally from your evaluation results. You don't need to predefine failure categories — Latitude finds them from the patterns in your data.

## Issue Lifecycle

Issues follow a state machine that models real-world incident response:

```
New → Escalating → Resolved → Regressed
         ↓                        ↓
       Ignored                 Escalating
```

### New

A freshly discovered issue. Your team hasn't reviewed it yet.

**Actions available:**

- Generate an evaluation to start monitoring
- Acknowledge and begin investigating
- Ignore if it's not worth tracking

### Escalating

The issue has been acknowledged and is being investigated. New occurrences continue to accumulate.

**Actions available:**

- Generate or refine linked evaluations
- Create annotation queue items for deeper investigation
- Resolve when a fix is deployed

### Resolved

The issue has been addressed. When you resolve an issue, you can optionally set a **monitoring window** — Latitude continues watching for the pattern and will mark the issue as Regressed if it reappears.

### Regressed

A previously resolved issue has reappeared. This triggers re-escalation so your team knows a fix didn't hold.

### Ignored

The issue is not worth tracking. Ignored issues are hidden from default views but can be un-ignored later.

## Generating Evaluations from Issues

One of the most powerful workflows in Latitude:

1. An issue is discovered from clustered failures
2. You click **"Generate Evaluation"** on the issue
3. Latitude generates a monitoring script that watches for this specific failure pattern
4. The evaluation runs on live traffic going forward
5. New failures are linked back to the issue, updating occurrence counts

This closes the loop from discovery to continuous monitoring. Instead of waiting for the next batch of failures to discover the issue again, you have an automated sentinel watching for it 24/7.

## Issue Analytics

Each issue provides:

- **Occurrence trend** — A time-series chart showing how often the issue is detected
- **Example traces** — Specific traces where the issue was found, so you can investigate root causes
- **Linked evaluation performance** — How well the generated evaluation is catching this pattern
- **Resolution history** — When the issue was resolved and whether it has regressed

## Next Steps

- [Issue Management](./management) — Workflows for triaging and resolving issues
- [Evaluations](../evaluations/overview) — How evaluations connect to issues
- [Scores](../scores/overview) — How scores feed into issue discovery
