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

- **A name and description** — Generated from clustered score feedback and related context, focused on the underlying failure pattern rather than one specific conversation
- **A lifecycle state** — Where the issue stands: New, Escalating, Resolved, Regressed, or Ignored
- **Linked evaluations** — Automated monitors watching for this specific pattern
- **Occurrence data** — How often the issue has been detected, trended over time
- **A centroid** — A running weighted vector that represents the issue's semantic identity for discovery

## How Issues Are Discovered

Issue discovery uses **hybrid semantic search** to match new failures against existing issues or create new ones. Here's how it works:

1. A score fails (non-draft, non-errored) and has no issue assignment yet
2. If the score comes from an issue-linked evaluation, it assigns directly to that issue — no search needed
3. Otherwise, the score's canonical **feedback** text is embedded using a vector model
4. Latitude runs **hybrid search** in Weaviate — combining vector similarity with BM25 text matching — against existing issue centroids and descriptions
5. Results are **reranked** using a dedicated reranking model
6. Candidates that don't pass minimum similarity and relevance thresholds are filtered out
7. If a matching issue is found, the score is assigned to it. If not, a **new issue** is created
8. The issue's name and description are generated (or refreshed) from the accumulated evidence

This means a single failed score can create a new issue. You don't need to predefine failure categories — Latitude finds them from the patterns in your data.

The canonical `feedback` text on each score is intentionally designed to be human/LLM-readable and clusterable — it describes the underlying failure pattern, which is what makes discovery work well.

## Issue Lifecycle

Issues have lifecycle states that model real-world incident response. An issue can be in **multiple states simultaneously** — for example, both "new" and "escalating."

### New

First discovered less than 7 days ago.

### Escalating

Occurrences in the last day are 33% greater than the average in the previous 7-day baseline. An issue can be both new and escalating.

### Resolved

No occurrences in the last 14 days, or manually resolved by a user.

### Regressed

New occurrences appeared after the issue was previously resolved.

### Ignored

Manually ignored by a user. Ignored issues are hidden from default views but can be un-ignored later. Ignoring an issue **immediately archives** its linked evaluations.

Conceptually:

- **Active** means not ignored and not resolved
- **Archived** means ignored or resolved without regression

## Creating Issues

Issues can come from several sources:

- **Automatic discovery** — Failed scores from evaluations, annotations, or custom sources that don't match any existing issue create new ones automatically
- **From annotations** — When annotating a trace, reviewers can link their annotation to an existing issue directly, bypassing automatic discovery for that score
- **From evaluations** — Failed scores from issue-linked evaluations assign directly to their linked issue without going through discovery

Annotations are the primary signal. They carry the highest centroid weight and issues with linked annotations are always visible in the product.

## Generating Evaluations from Issues

One of the most powerful workflows in Latitude:

1. An issue is discovered from clustered failures
2. You click **"Generate Evaluation"** on the issue
3. Latitude generates a monitoring script optimized to detect this specific failure pattern, running in the background
4. The evaluation runs on live traffic going forward
5. New failures from that evaluation are linked back to the issue directly, bypassing discovery

Issues may have several linked evaluations. Each generation starts a background job — the frontend polls for completion status.

## Issue Visibility

Not all issues appear in the default view immediately. Latitude uses a denoising strategy to keep the issues list actionable:

- **Issues with at least one linked annotation** are always visible — human evidence is the strongest signal
- **Manually created or manually linked issues** are always visible
- **Low-evidence issues** (only evaluation or custom score matches, no annotations) may be hidden from the default list until enough evidence accumulates

This prevents noisy, low-confidence detections from cluttering your issues page. As more scores match an issue or a human annotates a trace linked to it, the issue is promoted to full visibility automatically.

## Issue Analytics

Each issue provides:

- **Occurrence trend** — A time-series chart showing how often the issue is detected
- **Example traces** — Specific traces where the issue was found, so you can investigate root causes
- **Linked evaluation performance** — How well generated evaluations are catching this pattern, including derived alignment (MCC)
- **Seen at** — Recency and age information (e.g., "11d ago / 3y old")

## Next Steps

- [Issue Management](./management) — Workflows for triaging and resolving issues
- [Evaluations](../evaluations/overview) — How evaluations connect to issues
- [Scores](../scores/overview) — How scores feed into issue discovery
