# AI Benchmarks

`@tools/ai-benchmarks` is an offline harness that measures the decision quality of Latitude's LLM-based AI features — the system flaggers today, the annotator and evaluation runtime later. It runs in `tools/ai-benchmarks/` and is invoked via `pnpm --filter @tools/ai-benchmarks benchmark:*`.

## Goals

Two linked goals — one tactical for our own code today, one strategic for Latitude-the-product long-term — drive every design choice below.

**Goal 1: Keep flaggers and the annotator reliable as we iterate.** Latitude runs seven LLM flaggers plus one LLM annotator in production. Every prompt edit, model swap, or regex change can silently shift their behavior; today we learn about regressions from customer complaints rather than a metric we check before merge. The benchmark gives us that metric — precision / recall / F1 plus a per-row flip diff — so a prompt change becomes a reviewable behavior change in git.

**Goal 2: Dogfood the experience of building AI features on Latitude.** Latitude competes with Braintrust and Langfuse. Many of our customers are building exactly the kinds of AI features this benchmark measures — classifiers, annotators, LLM-as-judge pipelines. By starting with a pure-local harness — the same thing a developer *without* an observability platform would reach for — we get a baseline feel for the developer experience, which is direct product input for what Latitude should offer them. The [Vision](#vision-how-latitude-closes-the-loop) section lays out how Latitude's product surface grows to close this loop.

## Non-goals

The harness is deliberately **not**:

- **A replacement for unit tests.** Unit tests check code paths and edge conditions; the benchmark checks decision quality on realistic traces. Both exist.
- **An eval for deterministic matchers.** `tool-call-errors`, `output-schema-validation`, and `empty-response` run regex-based detection — failure modes are directly observable in code via assertion tests.
- **A training / fine-tuning pipeline.** We measure the classifier we already have; we don't produce weights.
- **A production runtime surface.** The harness lives in `tools/` — dev + CI only. No new API, UI, or background job.
- **A scope expander.** Fixing or broadening what the flaggers detect is a separate piece of work; this harness measures, it doesn't redefine.
- **Real-time drift detection.** Measuring shifts in production trace distribution over time is a production observability problem downstream of this.

## Philosophy

Five ideas drive every other decision in the harness.

**1. Fixtures are not source of truth; mappers are.** Every fixture JSONL on disk is the deterministic output of a mapper running against a pinned remote reference (a HuggingFace dataset SHA, a GitHub commit, later a Latitude dataset ID + revision). The JSONL itself is gitignored disposable cache — what gets committed is the mapper code and the pinned revisions it reads. Two developers with the same mapper always produce byte-identical fixtures, so there's nothing to diff in the artifact.

**2. Baselines are last-accepted behavior, committed and reviewable.** `baselines/<target>.json` is a frozen snapshot of one benchmark run's decisions (predictions + metrics). It never moves on its own; it moves when a human passes `--update-baseline` after auditing the flips in the inspector. A PR that edits a flagger prompt comes with a baseline diff the reviewer can walk through row by row — LLM behavior changes become reviewable in git.

**3. Per-row flips beat aggregate metrics.** F1 can go up by 0.01 while ten rows changed in opposite directions. The summary lies; the flip list doesn't. The runner produces both, the TUI centers on the flip list, and the discipline is: **never update a baseline without reading the flips**.

**4. No AI response cache, ever.** Every benchmark run hits Bedrock fresh. This is intentional. Caching would invalidate noise-floor measurement (same prompt → cached output, even at `temperature=0` variance is masked), hide the real cost per run, and prevent the benchmark from catching drift in upstream model behavior. At ~$0.03 per full run the honest measurement is worth paying for.

**5. The runner is indifferent to what it's measuring.** Adding a new target — another flagger, the annotator, a future LLM-as-judge evaluator — is a new entry in the target registry plus its mapper. No runner changes, no new metrics plumbing. The uniform shape is `FixtureRow[] → classifier(row) → predictions[] → metrics + flip diff`.

**6. Run each row once; know the noise floor.** Nova Lite at `temperature=0` is near-deterministic but not perfectly so. Before trusting any specific flip count, run an unchanged fixture N times and observe the baseline-to-baseline flip rate — that's the threshold below which "flips" are T=0 stochastic noise, not real change. Above it, investigate. The benchmark classifies each row once per run (cheap, honest); the discipline of knowing your noise floor stays with the operator.

## Architecture at a glance

```
 upstream (HF / GitHub / later Latitude dataset API)
       │
       ▼  (pinned revision)
 mapper  ────────── writes .meta.json sidecar (mapper source hash)
       │
       ▼
 fixtures/<target>.jsonl  ← gitignored; regenerated via `benchmark:fetch`
       │
       ▼  (benchmark:run)
 FixtureRow  ──adapter──► TraceDetail
       │
       ▼
 classifyTraceForQueueUseCase  (real classifier, unchanged from production)
       │  via withAi(meteringAIGenerateLive(meter))
       ▼
 Prediction { id, expected, predicted, phase }
       │
       ▼
 metrics + baseline diff + flip list
       │
       ▼
 ink TUI  ──on exit──►  one-line persistent summary
```

Nothing about the production classifier changes for benchmarking. The only seam is [`classifyTraceForQueueUseCase`](../packages/domain/annotation-queues/src/use-cases/run-system-queue-flagger.ts), a repository-free entry point that takes a pre-loaded `TraceDetail` — so benchmarks don't need a ClickHouse stub.

## Key concepts

### Target

A single measurable AI feature. Registered in `tools/ai-benchmarks/src/runner/targets.ts`. Today: `flaggers:jailbreaking`. Future: the other six flaggers, `annotator`, `evaluations:*`.

Each target carries:

- **id** (`<namespace>:<name>`, e.g. `flaggers:jailbreaking`)
- **mapper** — async function that returns `FixtureRow[]` from upstream
- **mapperSourcePath** — absolute path used for the staleness hash
- **classify** — the function the runner calls per row; for flaggers this is `classifyTraceForQueueUseCase` with the queue slug baked in
- **provider / modelId** — read from `SYSTEM_QUEUE_FLAGGER_MODEL` so benchmark cost reporting tracks production's model choice

Target IDs namespace-prefix so `--only flaggers:*` cleanly selects all flaggers once they exist.

### FixtureRow

The portable, human-readable representation of one golden example. Defined by `fixtureRowSchema` in `tools/ai-benchmarks/src/types.ts`:

```ts
interface FixtureRow {
  id: string
  source: string      // provenance — "jailbreakbench:attack-artifacts/..." or "latitude:<dataset-id>@..."
  licence: string     // "MIT", "research-only", "internal"
  expected: { matched: boolean }
  tier?: "easy" | "medium" | "hard"
  tags: string[]      // category labels, tactic name, etc.
  trace: {
    systemPrompt?: string
    messages: { role, parts: [{ type: "text", content }] }[]
  }
  notes?: string
}
```

Deliberately minimal. Only `trace.messages` varies per row in any meaningful way; everything else on `TraceDetail` (token counts, timings, costs, IDs) is defaulted at adapter time because no flagger strategy reads them.

### Mapper

A function that fetches upstream data at a pinned revision, translates each row into our queue's definition, and emits `FixtureRow[]`. Example: [`mapJailbreakBench`](../tools/ai-benchmarks/src/mappers/jailbreakbench.ts) pulls from three JailbreakBench attack methods (JBC/manual, PAIR, GCG) plus the JBB-Behaviors CSVs, relabels them against our jailbreaking queue definition (manipulation tactic required, not just harmful topic), and returns ~937 rows.

Mappers are where **label translation** happens — upstream's labels almost never map 1:1 to our queue definitions. A direct harmful prompt in JBB-Behaviors is a jailbreak by JailbreakBench's criterion but explicitly *not* a jailbreak by ours (no manipulation tactic). Mappers encode those translations.

### Fetcher

Generic HTTPS download with on-disk cache ([`tools/ai-benchmarks/src/mappers/fetcher.ts`](../tools/ai-benchmarks/src/mappers/fetcher.ts)). Takes `(url, cachePath, opts?)`, returns a `Buffer`. Cache is keyed by whatever path the mapper chose — usually includes the pinned SHA, so bumping a revision naturally bypasses the stale cache.

Supports optional `token` for gated HuggingFace datasets (`HF_TOKEN`). Cache lives at `~/.cache/latitude-benchmarks/upstream/<dataset>@<sha>/`.

### Fixture sidecar (staleness detection)

Every `benchmark:fetch` writes `fixtures/<target>.meta.json` next to the JSONL, containing a SHA-256 hash of the mapper source file and a timestamp. Every `benchmark:run` re-hashes the current mapper and compares.

Status | Runner behavior
---|---
`fresh` | proceed
`stale` | exit with error + hint; `--stale-ok` to override
`no-meta` | exit with error + hint; `--stale-ok` to override

This catches the classic footgun: someone bumps a pinned SHA in the mapper but forgets to re-run `benchmark:fetch`, then runs `benchmark:run` and sees results that no longer reflect the mapper state.

### TokenMeter (per-row)

Attached to the `AIGenerate` layer via [`meteringAIGenerateLive`](../tools/ai-benchmarks/src/runner/metering-ai.ts) so that every call the classifier makes to `ai.generate(...)` bumps a counter. Created fresh per row so decision-phase detection is per-row safe under `Effect.forEach(concurrency=10)`.

Tracks `attempts` (every call) vs `successes` (only on success). This split matters because the classifier catches `AI_NoObjectGeneratedError` and recovers to `matched=false` — from outside the error-path call looks like `attempts++` without `successes++`, and we surface it as a distinct `schema-mismatch` decision phase.

### Decision phase

Each prediction carries a `phase` derived from the per-row meter state + classifier result:

phase | how to read
---|---
`deterministic-match` | pre-filter returned `matched`; LLM never called
`deterministic-no-match` | pre-filter returned `no-match`; LLM never called
`llm-match` | pre-filter was `ambiguous` or strategy has no pre-filter; LLM returned `matched=true`
`llm-no-match` | LLM called and returned `matched=false`
`schema-mismatch` | LLM was called, response didn't match schema, classifier recovered to `matched=false`

Phase distribution is part of the report. A prompt edit that shifts 30% of rows from `llm-*` to `deterministic-*` (cheaper, faster) is a meaningful win even if F1 is flat.

### Sampling

`--sample N` classifies a subset of the fixture instead of the full set. Two properties matter:

- **Stratified.** The N rows are drawn half from positives (`expected.matched=true`) and half from negatives — not uniformly random over the whole fixture. A uniformly random sample of 30 rows over 737 positives + 200 negatives would skew to positives and produce near-undefined precision or recall. Stratified keeps both axes meaningful at small N.
- **Seeded (deterministic).** A PRNG — *pseudo-random number generator* — is a small algorithm that produces a long sequence of numbers that look random but are fully determined by an initial seed. Same seed → same sequence → same rows picked; different seed → different sequence → different rows. Our sampler uses `mulberry32` seeded with `0xbeefcafe` by default, so `--sample 30` produces the same 30 rows every time across machines, days, and git checkouts. Pass `--seed <n>` to get a different subset when you want variety without losing determinism.

The combination — stratified + seeded — means sampled runs are cheap (~10s, ~$0.005 for N=30), reproducible, and honest about both positive and negative behaviour. They're for quick feedback during prompt iteration and demos. Full-fixture runs are still the only basis for moving the baseline, which is why `--update-baseline` is rejected when `--sample` is set.

### Precision, recall, F1

Every benchmark run reports these numbers. They're different angles on the same question: how often does the classifier agree with the fixture's ground truth?

Using `flaggers:jailbreaking` as the running example — assume a run over a fixture with 737 positives (`expected.matched=true`) and 200 negatives. Every row lands in one of four buckets:

| | expected=true | expected=false |
| --- | --- | --- |
| predicted=true | **TP** — caught a real jailbreak | **FP** — false alarm on a benign row |
| predicted=false | **FN** — missed a real jailbreak | **TN** — correctly ignored |

From those four counts:

- **Precision** = `TP / (TP + FP)` — *"of all the times the flagger said jailbreak, how often was it right?"* Low precision = noisy queue. Reviewers open the queue, find 3 of 10 items aren't actually jailbreaks, lose trust, stop reviewing. This is what FP cost looks like in practice.
- **Recall** = `TP / (TP + FN)` — *"of all the real jailbreaks that existed, how many did the flagger actually catch?"* Low recall = real jailbreaks slip past in production unflagged.
- **Accuracy** = `(TP + TN) / total` — overall correct fraction. Easy to compute but **misleading on unbalanced datasets**: a flagger that returns `false` for every row gets 200/937 ≈ 21% accuracy on our fixture without doing any real work. Always read accuracy alongside precision/recall, not as a summary.
- **F1** = `2 × (precision × recall) / (precision + recall)` — the harmonic mean. Its property: it collapses when *either* precision or recall is small. A flagger with precision=1.0 and recall=0.01 (catches one jailbreak, never false-alarms — useless in practice) has arithmetic mean ~0.50 but F1 ~0.02. F1 is the standard single-number summary for binary classifiers because of this asymmetric penalty.

#### The tradeoff

Loosening a flagger (match more aggressively) raises recall but lowers precision. Tightening it (match more conservatively) raises precision but lowers recall. A prompt edit almost always moves one up and the other down, not both up. **F1 tells you the net direction.** Precision and recall side by side tell you *which side* moved:

- **F1 up, precision up, recall ~flat** — flagger got more conservative, cut some false alarms. Usually good.
- **F1 up, recall up, precision down** — flagger got more aggressive, catches more real cases at the cost of new false alarms. Whether that's good depends on the queue's cost of false alarm vs miss.
- **F1 down, precision up, recall way down** — flagger got too conservative and stopped catching real cases. Usually bad.

The benchmark prints all three side by side specifically so you can read both the net and the direction.

#### Per-tactic, per-phase breakdown

Overall F1 averages across the whole fixture, which hides regressions concentrated in a specific slice. The benchmark also breaks F1 down by `tags` (tactic for flaggers: persona-aim, fictional-framing, adversarial-suffix, jbb-harmful-direct, etc.) and by decision phase.

A common failure: overall F1 rises 0.01, but precision on `jbb-harmful-direct` (the hard-negative slice testing that direct harmful asks *without* a manipulation tactic aren't flagged) drops by 10%. The flagger got better at the easy stuff and worse at the one slice that precision actually matters for. Overall says "ship it"; per-tactic says "no — you broke the thing that matters." Read both.

#### Undefined metrics

Precision is undefined when there are zero predicted positives (0/0); recall is undefined when there are zero expected positives. The runner reports `n/a` for these cells rather than crashing — sampled runs on all-negative slices will land here legitimately.

#### What these metrics apply to

P/R/F1 are the right summary for **boolean classifiers**. Two of our three target families fit that shape directly:

- **Flaggers** (today) — output `{ matched: boolean }`, fixture labels `{ expected: { matched: boolean } }`, confusion matrix falls out directly.
- **LLM-as-judge evaluations** (future `evaluations:*`) — the judge itself outputs a verdict (pass/fail or a score thresholded to boolean). P/R/F1 then measure how well the judge agrees with a human-gold label. Same shape as flagger evaluation; "judge agrees with gold" stands in for "flagger catches real case."

They are **not** the right summary for **free-form text generators** — the annotator being the main case. An annotator emits feedback text, not a verdict; "was it right?" is a judgment about text quality, not a fact-of-the-row. When the annotator target lands (Phase 4), the metric layer extends:

- **Judge-reduced booleans** — an LLM-as-judge reads `(trace, annotator output)` and returns accept / reject per row. P/R/F1 then apply to that reduction, but you're measuring the judge's agreement with a reference, not the annotator's correctness directly. Quality of the judge becomes its own concern (which is where the `evaluations:*` family of targets sits).
- **Rubric scores** — multiple per-row judges (on-topic? hallucinating details not in the trace? appropriate length?), each with its own boolean or small score. No single F1 captures all of them; the report instead renders per-rubric columns and an aggregate approval rate.
- **Approval rate / win rate** — fraction of rows a judge (or human) marks acceptable, or rate at which output A beats output B in pairwise comparison. Simpler than P/R/F1 and more honest when ground truth doesn't exist as a discrete label.

The `FixtureRow` shape doesn't change between target families — every row already carries the full trace a classifier, annotator, or judge would read. What changes is the target's `classify` function (it runs the annotator + a judge, or runs the judge directly), the `Prediction` type (it carries rubric scores or a free-form verdict rather than just a boolean), and the reporter (per-rubric breakdown instead of a single confusion matrix). Baseline diffing stays meaningful because it works off per-row identity plus the target-specific verdict fields.

### Baseline

A baseline is **the last accepted behavior of a target**, frozen and committed to git. It's the reference point every subsequent run diffs against.

Why it exists: without a reference, each benchmark run is an island — you see a number but nothing to compare it to. With one, each run is a story about what changed. A PR that edits a flagger prompt comes with a baseline diff the reviewer can walk through row by row — LLM behavior changes become reviewable in git.

Practical shape:

- `baselines/<target>.json` is committed to git (no gitignore).
- Contains `{ runAt, metrics, perTactic, perPhase, fixtureSize, rowIdsHash, failures }`.
  - `metrics` / `perTactic` / `perPhase` — the same numbers the TUI prints, frozen at the moment the baseline was accepted.
  - `failures` — the per-row list of **failures only** (rows worth committing for diffing). A row is a failure when `predicted !== expected` (FP or FN), or when `phase` is `schema-mismatch` / `error` (verdict may match `expected` but the underlying call was unstable). Passing rows in stable phases are intentionally omitted to keep the file small.
  - `fixtureSize` + `rowIdsHash` — a cheap fingerprint of the fixture composition (`rowIdsHash` is `sha256(sorted-ids)`). Used to detect when the mapper added or removed rows between baseline and current run, without having to commit the full ID list.
- Baselines are only written by `--update-baseline`, never implicitly. The runner never "nudges" the baseline on its own — a human must explicitly accept the current state.
- `--update-baseline` is rejected when `--sample` is set (sampled runs aren't a complete measurement).

Diff semantics:

The diff is a set-symmetric operation over committed failure rows, plus a fixture-composition check:

- **addedFailures** — rows that fail in the current run but were not in the baseline failure list (regression, or new instability). Labeled `NEW` in the TUI flips view.
- **removedFailures** — rows that were in the baseline failure list but are no longer failures in the current run (fix, or instability that resolved). Labeled `FIX`.
- **changedFailures** — rows in both failure lists with a different `(predicted, phase)` tuple (e.g. FN in `llm-no-match` → FN in `schema-mismatch`). Labeled `CHG`.
- **fixtureChanged** — boolean. True when `fixtureSize` differs or `rowIdsHash` differs between current and baseline. When true the TUI shows a banner: added/removed counts may include rows that simply appeared or disappeared from the fixture, not real verdict regressions; consult the mapper diff alongside the baseline diff.

Passing rows that became different-phase passing rows (e.g. a true negative shifting from `llm-no-match` to `deterministic-no-match`) are intentionally invisible. The baseline does not commit per-row predictions for passing rows, so we cannot detect such transitions. They were weak signal anyway — the failure-set diff captures every change that affects verdict correctness.

What the baseline is NOT:

- **Not ground truth.** The fixture's `expected.matched` is the ground truth (from curation). The baseline can legitimately differ from ground truth (the classifier is wrong about some rows) and often does.
- **Not a pass/fail gate.** Nothing says "F1 must be ≥ X". Baselines catch *change*, not absolute quality.
- **Not immutable.** It moves whenever a human audits the flips and runs `--update-baseline`. That's the point.

The review-loop dynamic this enables:

```
Edit prompt → benchmark:run
  → TUI shows: +2 added, Δ1 changed, -6 removed failures vs baseline, F1 +0.6%
  → open inspector (Enter on each flip), audit one by one:

     - 5 FIX (removed failures): previously FN → now TP
       (rows where expected=true: the flagger was missing them in the
        baseline — false negatives — and now catches them — true
        positives. Real jailbreaks that were slipping through now get
        flagged. Recall went up on these 5 rows. Net positive.)

     - 2 NEW (added failures): previously passing → now FP
       (rows where expected=false: the flagger correctly ignored them
        in the baseline — true negatives, not committed — and now
        wrongly flags them — false positives, which appear as added
        failures. Two benign rows that used to pass quietly now produce
        false alarms in the queue. Precision dropped on these. Net
        negative, but narrow: acceptable tradeoff if the 5 FIX gains
        above outweigh them.)

     - 1 FIX (removed failure): schema-mismatch → llm-match
       (row where the LLM call used to return malformed output — a
        committed failure since schema-mismatch is unstable — and now
        returns a clean structured response with the correct verdict.
        Pipeline win.)

  → accept: benchmark:run --update-baseline
  → commit prompt change + baseline.json in same PR

Reviewer sees diff of baselines/<target>.json. Every row change is visible.
```

## CLI

Two entry points live under `src/scripts/`, wired as pnpm scripts.

### `benchmark:fetch`

```bash
pnpm --filter @tools/ai-benchmarks benchmark:fetch <target-id>
```

Runs the target's mapper, writes `fixtures/<target>.jsonl` and `fixtures/<target>.meta.json`. First run downloads upstream files into `~/.cache/latitude-benchmarks/`; subsequent runs are cache-only and fast.

### `benchmark:run`

```bash
pnpm --filter @tools/ai-benchmarks benchmark:run [options]
```

Options:

Flag | Purpose
---|---
`--only <ids>` | comma-separated target IDs or globs, e.g. `flaggers:jailbreaking,annotator` or `'flaggers:*'`
`--except <ids>` | same format, subtracted from `--only`'s result (or from "all targets" if no `--only`)
`--sample <N>` | classify only N rows (stratified, deterministic — see [Sampling](#sampling))
`--seed <n>` | override the default seed to get a different reproducible subset — only meaningful with `--sample`; error if passed alone
`--update-baseline` | overwrite `baselines/<target>.json` with current predictions (rejected when `--sample` is set)
`--stale-ok` | skip the fixture-staleness check (use sparingly; intentional for comparing two mapper revisions)
`--help` | print usage

For each selected target the runner:

1. Checks fixture freshness vs mapper source hash (listr2 task).
2. Loads the fixture JSONL, optionally applies stratified sampling (listr2 task).
3. Classifies each row with bounded concurrency (`Effect.forEach({ concurrency: 10 })`), updating a live progress counter (listr2 task).
4. Aggregates metrics, computes baseline diff (unless sampled), assembles the `ReportData`.
5. Renders the ink TUI. User navigates failed rows / baseline flips with arrows, inspects with Enter, quits with `q`.
6. Prints a one-line persistent summary to stdout after the TUI exits, so scrollback retains the numbers.

### Metrics reported

- Overall: precision, recall, F1, accuracy, confusion matrix (TP/FP/TN/FN)
- Per-tactic (for flaggers): same metrics broken down by tactic tag
- Per-phase: count of predictions in each decision phase (see above)
- Cost: total USD via `@domain/models` pricing tables, plus LLM attempts / successes

## Workflows

### Fresh clone, first run

```bash
pnpm install
pnpm --filter @tools/ai-benchmarks benchmark:fetch flaggers:jailbreaking    # ~15s, ~15MB
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking --update-baseline
```

The `--update-baseline` is necessary on first run because there's no baseline yet — the run snapshots the current flagger behavior into `baselines/flaggers/jailbreaking.json`. Commit the baseline file in the same PR that introduces the target.

### Quick sanity check (~10 seconds, ~$0.005)

```bash
# Default seed — always the same 30 rows
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking --sample 30

# Same size, different seed — a different but still reproducible 30 rows,
# useful when you want a second look without touching the fixture
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking --sample 30 --seed 42
```

30 stratified rows, seeded PRNG, skips baseline diff. For demoing the harness or smoke-testing after a prompt edit. If the first run looks good, swap the seed and rerun — a regression that only shows on one slice of the fixture will surface when the slice changes.

### Prompt iteration loop

```bash
# 1. Edit the flagger prompt
$EDITOR packages/domain/annotation-queues/src/flagger-strategies/jailbreaking.ts

# 2. Run against the full fixture (~2 min, ~$0.03)
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking

# 3. Read the TUI:
#    - F1 / precision / recall deltas
#    - flip list (tab to switch between failed-rows and baseline-flips view)
#    - Enter on a row → Inspector shows full trace + prediction + phase
#    - q to quit

# 4. Decide: accept, iterate, or revert
#    If accept:
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking --update-baseline
git add packages/domain/annotation-queues/src/flagger-strategies/jailbreaking.ts \
        tools/ai-benchmarks/baselines/flaggers/jailbreaking.json
git commit
```

The PR's baseline diff is the reviewable record of which rows' predictions changed. Reviewers can run locally and open the same inspector on the same flips.

### Bumping an upstream SHA

```bash
# 1. Edit the mapper to point at a new revision
$EDITOR tools/ai-benchmarks/src/mappers/jailbreakbench.ts   # e.g. bump HF_DATASET_REVISION

# 2. Regenerate the fixture
pnpm --filter @tools/ai-benchmarks benchmark:fetch flaggers:jailbreaking

# 3. Run (stale check passes because the fetch refreshed the sidecar)
pnpm --filter @tools/ai-benchmarks benchmark:run --only flaggers:jailbreaking

# 4. Expect: a "fixture changed" banner in the baseline diff if row IDs
#    differ from the prior fixture (rowIdsHash mismatch). Added/removed
#    failure counts may include rows that simply appeared or disappeared
#    from the fixture, not real verdict regressions — read the mapper
#    diff alongside. Inspect, accept, --update-baseline, commit.
```

### Adding a new target

Two files:

1. A mapper at `tools/ai-benchmarks/src/mappers/<name>.ts` that returns `Promise<FixtureRow[]>`. Use the fetcher for downloads; pin upstream revisions as constants. Relabel upstream labels against your queue's definition.
2. An entry in `TARGETS` at `tools/ai-benchmarks/src/runner/targets.ts`. For a new flagger, use the `flaggerTarget` factory with its queue slug:
   ```ts
   flaggerTarget({
     queueSlug: "refusal",
     mapper: mapOrBench,
     mapperSourcePath: fileURLToPath(new URL("../mappers/or-bench.ts", import.meta.url)),
   })
   ```

Runner, metrics, baseline diff, TUI — unchanged.

For the annotator (once added) or other non-flagger targets, define a new `BenchmarkTarget` without the factory; the `classify` function wires whatever use case the target invokes. The rest of the stack consumes the same `Prediction[]` shape.

## Data sources per target

Not every flagger has equal public data to draw from. Some are well-covered by academic benchmarks; others have almost nothing and depend on Latitude-internal curation. This table is the reference map.

| Flagger target | Public coverage | Primary public sources | Latitude curation effort |
| --- | --- | --- | --- |
| `flaggers:jailbreaking` | **Strong** | JailbreakBench (JBC manual + PAIR + GCG artifacts), TeleAI-Safety | **Low** — supplement with tool-output / indirect-injection examples from dogfood |
| `flaggers:refusal` | **Strong** | OR-Bench (80k prompts, MIT), XSTest, PHTest, JailbreakBench benign split | **Low** — supplement with dogfood-domain refusals |
| `flaggers:nsfw` | **Moderate** | REDDIX-NET, `eliasalbouzidi/distilbert-nsfw-text-classifier` training data | **Medium** — hand-curate neutral-topic negatives (anatomy, sex-ed, literature) that off-the-shelf sets lack |
| `flaggers:frustration` | **Weak** | IEMOCAP, MELD, DeepDialogue (all adjacent — acted or non-agent dialogue) | **High** — LLM-agent frustration ("you keep getting it wrong") isn't in any public corpus |
| `flaggers:forgetting` | **Weak** | BABILong, MRCR, NeedleInAHaystack | **High** — upstream measures *model retrieval from long context*, not "assistant lost track of an earlier user request" |
| `flaggers:laziness` | **None on-target** | Syco-bench, SycEval, Sandbagging evals (adjacent, not exact) | **Very high** — fixtures primarily synthesised or drawn from dogfood |
| `flaggers:trashing` | **None** | — | **Entirely internal** — no public agent-loop benchmark exists; synthesise negatives by truncating productive dogfood traces |
| `annotator` (future) | — | — | Different problem shape: judge via LLM-as-judge on free-form feedback text; rows come from a Latitude-hosted dataset |

Notes on specific sources:

- **Lakera PINT** is a well-known jailbreak benchmark but the full 3016-input dataset is held proprietary by Lakera specifically to prevent training on it. Only a ~7KB format-example file is public. Not a usable source for our fixture.
- **WildChat** and **LMSYS-Chat-1M** have real-user jailbreak attempts in the wild but are research-licensed (gated, `HF_TOKEN` required, terms accepted). Usable via the optional token flow but not shippable as a public benchmark.
- **In-The-Wild-Jailbreak-Prompts** (TrustAIRLab) has ~2000 real user-submitted jailbreaks but with noisy labels — inclusion criterion is "shared in a jailbreak community forum," not "manipulation tactic verified." Requires relabel before use.

Practical consequence: the top three flaggers can reach v1 sizes (100–200 examples) largely via HuggingFace + relabel. The bottom four are rate-limited by how fast the team can hand-curate real agent traces, which is why Phase 3 (internal curation) is the slow tier of the roadmap.

### Label translation

Upstream labels almost never map 1:1 to our queue definitions. The mapper encodes the translation:

- **JailbreakBench** labels "misuse behaviors" (harmful intent). Our `jailbreaking` queue specifically requires a **manipulation tactic** on top of harmful intent — "how do I make a bomb" is JailbreakBench-positive but our-queue-negative. The jailbreakbench mapper uses attack-artifact rows (which carry real manipulation tactics) as positives and raw behaviors as hard negatives.
- **OR-Bench** labels "over-refusal triggers." Maps cleanly to our `refusal` queue's positive definition.
- **IEMOCAP** labels acted spoken emotion. Relationship to LLM-agent frustration is indirect — upstream rows may not transfer, and the mapper's job is to filter out the ones that don't.

A mapper is the opinionated contract between upstream reality and our queue's definition. Two mappers reading the same upstream source may produce very different fixtures.

## Curation discipline

Our queue prompts are opinionated definitions of what counts as a match. A fixture whose labels disagree with the queue's own prompt produces a benchmark that measures agreement with someone else's concept — useless. Before trusting the first benchmark run on any target:

1. Take ~50 examples (positives + negatives) and have two team members label them independently against the queue's current system prompt in `flagger-strategies/<queue>.ts`.
2. Resolve disagreements by re-reading that system prompt. The prompt is the source of truth for what counts; labels conform to it, not the other way around.
3. If the prompt itself leaves an example ambiguous, flag it as "prompt-ambiguous" and surface it as a prompt-clarification issue — don't quietly pick a label.
4. Target ≥85-90% inter-annotator agreement on the ~50 before scaling up. Numbers on a fixture that wasn't calibrated look rigorous but measure the wrong thing.

This mirrors industry practice for LLM-as-judge calibration. It's cheap (an afternoon of work) and skipping it is one of the most common reasons a benchmark becomes misleading.

## Phased roadmap

The `benchmark:run` pipeline — runner, metrics, baseline diff, reporter — is uniform. **All variation lives in the mapper** (what data exists, how to relabel it). That tier-of-difficulty drives phase order.

| Tier | Example source | Mapper work |
| --- | --- | --- |
| Trivial | JailbreakBench, OR-Bench, XSTest | Download HF/GitHub snapshot at pinned SHA + light label translation |
| Gated | WildChat, LMSYS, REDDIX-NET | Same as trivial + `HF_TOKEN` + terms-accepted check |
| Curated | Latitude dogfood | Query our own traces, PII scrub, hand-label, emit JSONL (or in future, pull from a Latitude dataset) |

### Phase 1 (current): `flaggers:jailbreaking`

End-to-end validation with one target. 937-row fixture (persona-aim + fictional-framing + adversarial-suffix positives from JailbreakBench attack artifacts; JBB-Behaviors soft and hard negatives). Proves the pipeline, establishes the baseline-diff workflow, validates cost tracking.

### Phase 2: breadth via public sources

Add targets whose data exists publicly. `flaggers:refusal` (OR-Bench, XSTest, PHTest), `flaggers:nsfw` (REDDIX-NET + NSFW classifier training data, gated), possibly expand `flaggers:jailbreaking` with additional attack methods. Pure mapper additions; runner untouched.

### Phase 3: internal curation for the hard flaggers

`flaggers:frustration`, `flaggers:forgetting`, `flaggers:laziness`, `flaggers:trashing`. No public data on-target; fixtures come from Latitude dogfood via a labeling workflow (LLM-assisted pre-label + human review of disagreements). Depends on the product work described below to happen at scale.

### Phase 4: annotator evaluation

Different problem shape from flagger classification — the annotator emits free-form text, not a boolean. Measurement is LLM-as-judge on the feedback string. The current v1 architecture already carries the full `trace` payload in every `FixtureRow`, so the annotator is a new target with a different `classify` function; no runner changes.

## Vision: how Latitude closes the loop

The local-first shape of the benchmark is deliberate. Two product capabilities in Latitude itself would dramatically improve the workflow — and the friction we hit building this benchmark locally is exactly the friction our customers would hit building their own. That friction is the product input.

### Flagger datasets hosted in Latitude

**Today:** fixtures are generated from public sources plus, eventually, hand-committed dogfood files.

**Future:** a customer running Latitude in production already annotates traces when a flagger produces a wrong signal. Those annotations are the raw material of a golden dataset — real, labeled, from a real distribution. What Latitude needs to build to enable a `mappers/latitude.ts`:

1. **Programmatic dataset API + SDK.** `datasets.create` / `datasets.insertRows` / `datasets.export` via the public API and `@latitude-data/sdk`. Today datasets can only be created in the UI.
2. **"Add to dataset" as an annotation action.** One-click in the trace-review UI: "this belongs in `refusal-golden` with label `matched=true`." Annotations become dual-purpose — queue signal + dataset row.
3. **Per-dataset label schema.** Each dataset declares its expected label shape (e.g. `{ matched: boolean, tier: "easy" | "hard" }`). Validated at insert time so mappers can rely on schema consistency.
4. **Pinnable dataset export.** Deterministic export-at-revision endpoint the mapper consumes for reproducibility, just like a HuggingFace SHA.

Once those exist, the Latitude mapper is a new file:

```ts
// tools/ai-benchmarks/src/mappers/latitude.ts (future)
export async function mapLatitudeDataset({ datasetId, revision }): Promise<FixtureRow[]> {
  const rows = await latitudeSdk.datasets.export({ datasetId, revision })
  return rows.map(toFixtureRow)
}
```

The runner doesn't change. The `source` field on each row carries provenance: `jailbreakbench:...@<sha>` today, `latitude:<dataset-id>@<timestamp>` tomorrow.

### Annotator evaluation via issues + monitors + experiments

**Today:** the annotator emits free-form feedback text. Evaluating it offline means rolling an LLM-as-judge per feature — bespoke, low leverage.

**Future**, using Latitude primitives that already exist:

- Latitude clusters annotations into **issues** when enough share a theme.
- Issues carry **monitors** — LLM evaluations scoped to the specific problem the issue represents.

The experiment flow lights this up:

1. Developer downloads a dataset from Latitude.
2. Runs their new AI feature (e.g. a tweaked annotator prompt) on the dataset locally.
3. Pushes the resulting traces back to Latitude **tagged as an experiment**.
4. Every relevant monitor evaluates every experiment trace. Optionally the developer scopes the experiment to one issue/monitor — *"this experiment passes iff the monitor on `annotator-repeats-user-prompt` comes clean."*
5. Monitor result = test outcome.

Both outcomes are grounded in production reality:

- **Experiment fails** → the problem a real user hit is still unresolved. Don't ship.
- **Experiment passes** → the fix is tied to a real production issue, with evidence. Ship with confidence.

The LLM judges here aren't invented for the eval run — they're **the monitors that already exist because a human flagged a real problem in production**. That's the difference between eval-as-ceremony and eval-as-production-truth, and it's a story only a tool in Latitude's position can tell.

### What this vision asks of v1

Three design choices in the v1 harness keep forward compatibility so the evolution above is mechanical, not a rewrite:

- **The `FixtureRow` shape aligns with what a Latitude dataset export could provide** (`trace` + structured label + provenance). No upstream rework needed when the Latitude mapper arrives.
- **Fetching is pluggable.** `mappers/jailbreakbench.ts` today, `mappers/latitude.ts` later, same runner contract.
- **The runner is indifferent to `source` provenance.** `FixtureRow.source` is metadata for reports, not a runner precondition.

Nothing in v1 blocks the vision. Nothing in the vision requires rewriting v1.

## Failure modes to know about

**Updating baselines reflexively.** "7 flips? whatever, `--update-baseline`." Now 7 regressions are blessed. Always inspect flips before updating.

**Chasing aggregate F1.** F1 can rise while specific high-value rows silently regress. Read the per-tactic table: a hit to `jbb-harmful-direct` precision (false positives on direct harmful asks without manipulation tactic) is a worse signal than a same-sized F1 drop distributed across easy cases.

**Baseline vs ground truth drift.** The baseline captures what the classifier does; `expected.matched` captures what it *should* do. A row that's been in the baseline as wrong for 20 `--update-baseline` operations is the classifier getting away with a persistent error. The report shows counts of FP/FN — watch those, not just F1.

**Forgetting to re-fetch after a mapper edit.** The sidecar check catches this, but only if you don't pass `--stale-ok`. `--stale-ok` is for comparing two mapper revisions manually; in normal iteration don't use it.

**Shell-escaping glob selectors.** `--only flaggers:*` gets expanded by bash. Quote it: `--only 'flaggers:*'`.

**Sampled runs not being comparable.** `--sample 30` produces metrics over 30 rows, not a full-fixture measurement. The runner refuses `--update-baseline` when sampling, and the TUI says "sample mode — baseline comparison disabled". Don't treat a sampled run's F1 as comparable to the baseline's.

## Related files

- **Package**: [tools/ai-benchmarks/](../tools/ai-benchmarks/)
- **Classifier entry point** (repository-free): [packages/domain/annotation-queues/src/use-cases/run-system-queue-flagger.ts](../packages/domain/annotation-queues/src/use-cases/run-system-queue-flagger.ts) — `classifyTraceForQueueUseCase`
- **Flagger strategies** (what the benchmark measures): [packages/domain/annotation-queues/src/flagger-strategies/](../packages/domain/annotation-queues/src/flagger-strategies/)
- **Pricing data source**: [packages/domain/models/](../packages/domain/models/) (bundled models.dev data)
- **AI layer production wiring**: [packages/platform/ai/src/with-ai.ts](../packages/platform/ai/src/with-ai.ts), [packages/platform/ai-vercel/src/ai.ts](../packages/platform/ai-vercel/src/ai.ts)
