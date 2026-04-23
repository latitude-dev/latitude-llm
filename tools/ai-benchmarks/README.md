# @tools/ai-benchmarks

Offline benchmark harness for Latitude's AI features — flaggers today, the
annotator and evaluation runtime later.

## What it does

For each benchmark target (e.g. the `jailbreaking` system flagger), the
harness:

1. Runs a **mapper** to fetch upstream datasets (HuggingFace, GitHub raw,
   later the Latitude API) and emit a normalized `FixtureRow[]` to
   `fixtures/<target>.jsonl`.
2. **Runs** each fixture through the real classifier / annotator / judge,
   recording the prediction and which phase decided (deterministic pre-filter
   vs. LLM fallback).
3. Aggregates metrics (precision, recall, F1, per-tactic breakdown) and
   **diffs against a baseline** committed at `baselines/<target>.json`, so
   prompt changes surface as a flip list.

Fixtures are gitignored — they're regenerated from pinned upstream refs.
Baselines and mappers are committed.

## Usage

```bash
# Fetch upstream data and materialise the fixture for a target.
pnpm --filter @tools/ai-benchmarks benchmark:fetch flaggers:jailbreaking

# Run the benchmark (requires Bedrock creds for the classifier's LLM calls).
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking
```

See [docs/ai-benchmarks.md](../../docs/ai-benchmarks.md) for the full CLI flag list, workflows, and philosophy.

## Why it lives outside `@domain/annotation-queues`

Today flaggers live in `packages/domain/annotation-queues/`, but that
location is an implementation detail. The benchmarks here are cross-cutting
AI-quality tooling — they'll grow to cover the annotator (`run-system-queue-
annotator.ts`) and the evaluation runtime (`@domain/evaluations`). Keeping
them in their own dev-only package decouples benchmark growth from the
current file organisation of what they test.

## See also

- Full documentation: [docs/ai-benchmarks.md](../../docs/ai-benchmarks.md)
- The refactor that made this package possible:
  `classifyTraceForQueueUseCase` / `annotateTraceForQueueUseCase` —
  repo-free entry points in `@domain/annotation-queues` that take a
  pre-loaded `TraceDetail` so the benchmarks don't need a ClickHouse stub.
