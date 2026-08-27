# Agent Benchmark

> **Documentation**: durable homes after stabilization: `dev-docs/signals.md` (the signal dimension field), `dev-docs/conversation-intelligence.md` (moments as outcome evidence), `dev-docs/flaggers.md` (the deterministic vs LLM scoring rule), `dev-docs/spans.md` (session rollup reads), plus a new `dev-docs/agent-benchmark.md` for the score itself.
>
> **Status**: design in progress. No code written.
>
> **Constraint that shaped the design**: the score must use telemetry Latitude already collects. It must not need a new per-trace LLM judge, and it must not need the customer to configure an evaluation.

## Contents

1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [What the score is](#3-what-the-score-is)
4. [Shared machinery](#4-shared-machinery)
5. [Outcome quality](#5-outcome-quality)
6. [Reliability](#6-reliability)
7. [Process quality](#7-process-quality)
8. [Efficiency](#8-efficiency)
9. [Safety](#9-safety)
10. [The composite](#10-the-composite)
11. [Attribution and recommendations](#11-attribution-and-recommendations)
12. [Confidence](#12-confidence)
13. [Invariance rules](#13-invariance-rules)
14. [Storage and computation](#14-storage-and-computation)
15. [Enabling changes](#15-enabling-changes)
16. [Open questions](#16-open-questions)
17. [Tasks](#tasks)

---

## 1. Problem

Latitude tells a user what happened in one session, in one trace, or under one signal. It does not tell the user how the agent is doing.

A user who wants to answer "is my agent good?" today must read several pages and combine them by hand. The Signals page shows defects but not their share of traffic. The Sessions page shows volume, cost and latency but says nothing about quality. Tools, Memory and Behaviours each show one slice. None of them compare this week to last week, and none of them rank the problems by how much they cost the user. The result is that a team can ship a change, watch every page stay green, and never learn that the agent got worse.

## 2. Solution

The Agent Benchmark is one page with one number from 0 to 100. Latitude computes the number the same way for every project, from telemetry the platform already stores. The number moves when the agent changes, and the page below it explains every point the agent lost, ranked by how many sessions each problem touched.

The number is a weighted mean of five dimensions: outcome quality, reliability, process quality, efficiency and safety. Each dimension has its own applicability test. When a dimension does not apply to an agent, Latitude marks it as not measured and renormalizes the weights over the rest. A batch classifier with no user turns is not scored on conversation outcomes, and an agent with no tools is not scored on tool trajectories. Latitude shows the number next to a confidence figure and a margin of error. A score computed from 200 sessions never reads as if it came from 200,000.

## 3. What the score is

The score answers one question: **what share of this agent's sessions went cleanly?**

It does not claim the agent gave correct answers. Correctness needs ground truth, and most projects have none. What Latitude can see is every trace, every tool call, every error, every user reaction, and every defect its own detectors found. A session goes cleanly when none of that evidence shows trouble.

The definition fixes three things about how the score behaves.

The session is the unit. Every dimension is a rate over sessions, so a session with twenty failing spans counts once, and clicking any lost point lands on the sessions that lost it.

Only observed behaviour counts. A user who triages signals must not score worse than a user who ignores them. Section 13 states this as a hard rule.

Absence of evidence is not a pass. A project with no conversational sessions gets no outcome score rather than a perfect one.

### The five dimensions

| Dimension | Question | Shape | Weight |
| --- | --- | --- | --- |
| Outcome quality | Did sessions end with the user getting what they wanted? | Apdex | 0.35 |
| Reliability | Did runs finish without failing? | Apdex | 0.30 |
| Process quality | Did the agent take a sensible route? | Apdex | 0.20 |
| Efficiency | Did the agent spend tokens, money and time reasonably? | Curves | 0.15 |
| Safety | Did the agent produce something it should not have? | Cap | none |

Safety carries no weight because it is a ceiling on the composite, not a term in it. Low latency must not compensate for a leak.

## 4. Shared machinery

### Window and unit

The eligible base is every session in the window with LLM activity, which the session field registry already exposes as `hasLlmActivity` (`tokens_total > 0 OR length(models) > 0`). Instrumentation-only sessions and idle sessions stay out of the denominator.

The window is not fixed. A team that runs a million sessions a week wants a number that reacts within days. A team testing an agent before launch runs thirty sessions a week and wants a number at all. One window length cannot serve both, and a fixed 7 days makes the score invisible to the second team even after a month of testing.

Latitude picks the shortest window from a ladder that holds at least `BENCHMARK_TARGET_SESSIONS` (300) eligible sessions:

| Ladder step | Used when |
| --- | --- |
| 7 days | the trailing week holds 300 or more eligible sessions |
| 14 days | the week does not, but the fortnight does |
| 30 days | neither does |

A busy project always lands on 7 days and reacts fast. A quiet project widens to 30 days and gets a stable number instead of no number. The chosen window is stored on the snapshot and shown next to the score, because a score over 30 days and a score over 7 days answer slightly different questions.

Every count in this spec is over the chosen window.

### Apdex form

Three dimensions classify each session into one of three buckets, then take the Apdex ratio:

```
dimension = (|satisfied| + |tolerating| / 2) / |eligible|
```

A session starts as satisfied. Observed evidence demotes it. Absence of evidence never demotes it, which is what keeps the middle bucket meaningful: tolerating means Latitude saw partial trouble, not that Latitude saw nothing.

Each Apdex dimension is a **union of session sets**. A signal joins the set of its own dimension (section 15.2). The sets union rather than sum. A defect that both the mechanical metric and a signal detected therefore costs the same as one that only the mechanical metric detected. Double counting is impossible by construction.

### Curve form

Efficiency maps each raw metric through a clamped linear curve between two control points:

```
curve(v, good, poor) = clamp01( (poor - v) / (poor - good) )     for down-good metrics
curve(v, good, poor) = clamp01( (v - poor) / (good - poor) )     for up-good metrics
```

A value at or past `good` scores 1. A value at or past `poor` scores 0. The dimension is the weighted mean of its applicable curves.

The control points below are provisional. Lighthouse derives its equivalents from a corpus percentile rather than from judgement, and Latitude can do the same once the score runs on production traffic. Section 16 tracks that.

### Which detector output counts

Latitude has two kinds of flagger, and they earn different trust:

- A **deterministic** flagger is code. It runs on 100% of sessions and cannot hallucinate. Its scores count directly, whether or not the signal they cluster into is promoted. These are `tool-call-errors`, `output-schema-validation`, `empty-response`, `low-cache-hit-rate`, and the deterministic arm of `trashing`.
- An **LLM** flagger is sampled at 10% and only persists positive findings, so its raw occurrence count is not a rate. Its scores count only through a **promoted** signal, where the promotion threshold has already demanded repeated evidence.

The two arms of `trashing` are separable on the score row. `annotationScoreMetadata.flaggerTraceId` is set only when the decision came from a captured LLM call. An absent trace id means the deterministic arm fired.

### Promoted signals only

`scores.signal_id != ''` in ClickHouse includes unpromoted candidates, because promotion state lives in Postgres. Every read in this spec passes the promoted signal id set explicitly. `listSignalWindowMetrics` already accepts a `signalIds` argument.

## 5. Outcome quality

Whether the user got what they came for. This is the only dimension that knows anything about the agent's job, so it carries the largest weight.

Latitude cannot judge correctness, but it can read the user's own reaction. Conversation intelligence runs on every session that ends, with no sampling, and labels moments from a fixed set of ten kinds. Five of those kinds are the user telling Latitude that the agent failed. That is stronger evidence than any judge, because the ground truth is the next turn rather than a model's opinion.

### Metrics

| Metric | Source | Coverage |
| --- | --- | --- |
| Strong failure moments: `user_correction`, `clarification_loop`, `abandonment`, `escalation`, `user_frustration` | `session_moment_labels` | every analyzed session |
| Weak failure moments: `stalling`, `hesitation`, `policy_refusal` | `session_moment_labels` | every analyzed session |
| Success moments: `resolution`, `user_satisfaction` | `session_moment_labels` | every analyzed session |
| Promoted signals with `dimension = outcome` or `dimension = none` | `scores.signal_id` joined to the promoted set | repeated evidence only |
| Analyzed session count and skip reasons | `session_analyses.analysis_status` | every session |

Success moments do not raise the score. Their absence is not evidence of failure, so treating them as positive would punish quiet sessions. They raise the **evidence coverage** figure instead (section 12), which is the honest use for them: they separate "we saw it go well" from "we saw nothing".

### Formula

The denominator is the analyzed subset, not the eligible base:

```
analyzed   = sessions in window with analysis_status = 'analyzed'

frustrated = sessions with >=1 strong failure moment
           U sessions hit by >=1 promoted signal of dimension outcome or none

tolerating = sessions with >=1 weak failure moment, minus frustrated

satisfied  = analyzed - frustrated - tolerating

Outcome    = (|satisfied| + |tolerating| / 2) / |analyzed|
```

### Applicability

`session_analyses.analysis_status` is an exact applicability oracle. A session that is not a conversation records `skipped_non_conversation`, because the analyzer found no user and assistant message pair. Two gates apply:

```
|analyzed| >= BENCHMARK_MIN_SESSIONS     (30, the same floor the composite uses)
|analyzed| / |eligible| >= 0.25          (the dimension describes a real share of traffic)
```

The volume gate is the shared floor rather than a stricter per-dimension number. A dimension measured over 40 sessions is exactly as imprecise as a composite over 40 sessions, and the interval already says so. The representativeness gate is independent of volume and does not move. A dimension that describes a fifth of the traffic must not be weighted as if it described all of it.

Below either gate the dimension is not measured and its weight redistributes. A coding agent or a batch workflow will normally fall out here, which is the correct result.

## 6. Reliability

Whether a run finishes. This dimension is fully deterministic and runs at 100% coverage, so it is the one Latitude can show with the most confidence on a project's first day.

The distinction that matters is between a run that hit an error and recovered and a run that ended badly. Agents retry constantly and succeed. Scoring a successful retry as a failure is wrong. Scoring it as clean throws away real information. Recovery is what the middle bucket is for.

### Metrics

| Metric | Source | Coverage |
| --- | --- | --- |
| Last trace of the session errored | `traces.error_count` with `argMax` over `min_start_time` | 100% |
| Session produced no assistant output at all | `traces.output_messages` | 100% |
| Any error span in the session | `sessions.error_count` | 100% |
| Deterministic flagger hits: `tool-call-errors`, `output-schema-validation`, `empty-response` | `scores` with `metadata.flaggerSlug` | 100% |
| Unreliable finish reason on the session's last chat span | `spans.finish_reasons` | 100%, needs the classifier below |
| Unreliable finish reason on an earlier chat span | `spans.finish_reasons` | 100%, needs the classifier below |
| Promoted signals with `dimension = reliability` | promoted signal set | repeated evidence only |

The terminal failure test needs no schema change. The `traces` table already carries `session_id`, `error_count`, `min_start_time` and `output_messages`, so the last turn of every session resolves in one grouped read:

```sql
SELECT session_id,
       argMax(errored, started)    AS last_trace_errored,
       argMax(has_output, started) AS last_trace_produced_output,
       max(errored)                AS any_trace_errored
FROM (
  SELECT argMaxIfMerge(session_id)                  AS session_id,
         sum(error_count) > 0                       AS errored,
         min(min_start_time)                        AS started,
         length(argMaxIfMerge(output_messages)) > 0 AS has_output
  FROM traces
  WHERE organization_id = {org} AND project_id = {proj} AND min_start_time >= {from}
  GROUP BY trace_id
)
GROUP BY session_id
```

This is also a better definition than a root span status column would give. It does not depend on the customer propagating error status up to the root span, which most auto-instrumentation does not do.

### Finish reasons

A generation that stops because it ran out of tokens, hit a provider filter, or emitted a malformed call did not finish its job. Almost none of those set an error status, so an error count alone cannot see them. Truncation is the common one: the answer stops mid-sentence, the user sees a broken response, and the telemetry looks clean.

A finish reason is unreliable when the run ended for a reason other than the model finishing its answer or the caller stopping it. Latitude classifies every value into three classes.

| Class | Values | Treatment |
| --- | --- | --- |
| Clean | `stop`, `end_turn`, `complete`, `eos`, `finish`, `stop_sequence`, `cancelled`, `canceled`, `aborted`, `client_disconnect`, `tool_calls`, `tool_call`, `tool_use`, `function_call`, `pause_turn`, `refusal` | no effect |
| Unreliable | `length`, `max_tokens`, `max_output_tokens`, `model_length`, `content_filter`, `content_filtered`, `safety`, `image_safety`, `recitation`, `blocklist`, `prohibited_content`, `spii`, `guardrail_intervened`, `error_toxic`, `malformed_function_call`, `error` | demotes the session |
| Unknown | `other`, `unknown`, and any value not in either list | confidence only |

Four boundaries need saying out loud.

Tool-call reasons are clean. An agent turn that ends to call a tool is the normal shape of a loop, not a failure, and the tool's own outcome is already measured by tool errors.

Caller-forced stops are clean. A configured stop sequence, a cancelled request, or a disconnected client is the caller setting a boundary. The agent did what it was told.

`refusal` is clean here. The model worked correctly and declined on purpose. Whether the refusal was correct is an outcome question, and the `refusal` flagger already answers it.

Unmapped values go to confidence rather than to the score. `other` and `unknown` usually mean the SDK could not map a provider value, so scoring them would penalize instrumentation quality rather than the agent. The confidence panel reports the unmapped share so a project with many of them knows its reliability figure is incomplete.

Values arrive provider-native with only light normalization (`otlp/resolvers/response.ts`), so the lists compare against `lower(reason)`. Gemini emits uppercase, Anthropic uses `end_turn` where OpenAI uses `stop`, and Cohere uses `COMPLETE`. The classifier is one shared helper in `@domain/spans` so the field registry, the score, and any UI read the same list.

Position decides the bucket. `finish_reasons` sits on every chat span, and an agent loop has many:

```sql
SELECT session,
       argMax(unreliable, ended) AS terminal_unreliable,
       max(unreliable)           AS any_unreliable,
       max(unknown)              AS any_unknown
FROM (
  SELECT coalesce(nullIf(session_id, ''), toString(trace_id)) AS session,
         end_time                                             AS ended,
         arrayExists(r -> lower(r) IN {unreliable:Array(String)}, finish_reasons) AS unreliable,
         arrayExists(r -> lower(r) NOT IN {classified:Array(String)}, finish_reasons) AS unknown
  FROM spans
  WHERE operation IN ('chat', 'text_completion', 'generate_content')
    AND notEmpty(finish_reasons)
    AND {scope}
)
GROUP BY session
```

`classified` is the union of the clean and unreliable lists. An unreliable reason on the last chat span means the run ended badly. An unreliable reason on an earlier span means the agent hit the problem and kept going, which is the same recovery distinction the rest of this dimension uses.

### Formula

```
frustrated  = sessions where the last trace errored
            U sessions that produced no assistant output
            U sessions whose last chat span has an unreliable finish reason
            U sessions hit by >=1 promoted signal of dimension reliability

tolerating  = sessions with any error span
            U sessions with a deterministic reliability flagger hit
            U sessions with an unreliable finish reason on an earlier chat span
            minus frustrated

satisfied   = eligible - frustrated - tolerating

Reliability = (|satisfied| + |tolerating| / 2) / |eligible|
```

### Applicability

Always applicable.

## 7. Process quality

Whether the agent took a sensible route to its answer. A run can finish, satisfy the user, and still have burned nine tool calls where two would do.

Latitude has unusually complete data here. Every tool call is a span with its own input, output, status and duration. The defined tool surface is materialized from the chat span's tool definitions.

### Metrics

| Metric | Source | Coverage |
| --- | --- | --- |
| Thrashing: the same tool and arguments repeated three times in a row | deterministic `trashing` score | 100% |
| Tool loop shape: one tool is at least 60% of at least 5 calls | `spans` grouped by session and tool name | 100% |
| Tool called but never defined | `sessions.tools` minus `sessions.defined_tools` | 100% |
| Memory thrash: no-op rewrites and reverted writes | `memory_events` via the memory analytics reader | memory-enabled sessions |
| Promoted signals with `dimension = process` | promoted signal set | repeated evidence only |

The tool loop rule reuses the threshold the `tool:loop` hint gatherer already applies, and it resolves in SQL without loading conversations:

```sql
SELECT session_id, max(cnt) AS dominant, sum(cnt) AS total
FROM (
  SELECT session_id, tool_name, count() AS cnt
  FROM spans
  WHERE operation = 'execute_tool' AND {scope}
  GROUP BY session_id, tool_name
)
GROUP BY session_id
HAVING total >= 5 AND dominant / total >= 0.6
```

### Formula

The denominator is tool-using sessions, because a session with no tool calls has no trajectory to judge:

```
toolUsing   = eligible sessions with >=1 execute_tool span

frustrated  = thrashing sessions
            U sessions hit by >=1 promoted signal of dimension process

tolerating  = tool loop shape sessions
            U sessions that called an undefined tool
            U memory thrash sessions
            minus frustrated

satisfied   = toolUsing - frustrated - tolerating

Process     = (|satisfied| + |tolerating| / 2) / |toolUsing|
```

### Applicability

```
|toolUsing| >= BENCHMARK_MIN_SESSIONS
```

A known gap: this dimension cannot see a session where the agent should have called a tool and did not. That needs a trajectory judge, which is out of scope.

## 8. Efficiency

Whether the agent spends tokens, money and time in proportion to the work it does.

This dimension deliberately measures waste that is waste regardless of how the session ended. Charging a badly ended session's tokens here would deduct the same failure twice, once in outcome and once in efficiency. Every metric below is wasteful even in a session that succeeded.

### Metrics

| Metric | Definition | Source | Direction |
| --- | --- | --- | --- |
| Dead tool share | count of `defined_tools` never present in `tools`, over the count of `defined_tools` | session rollup | down-good |
| Cache efficiency | `tokens_cache_read / (tokens_input + tokens_cache_read + tokens_cache_create)` | session rollup, the existing `cacheHitRate` field | up-good |
| Duplicate tool work | excess identical `(session, tool_name, hash(tool_input))` calls / total tool calls | `spans` | down-good |
| Latency drift | window p95 session duration / trailing 28 day p95 | `cohort-baselines.ts` | down-good |
| Cost drift | window mean cost per session / trailing 28 day mean | session rollup | down-good |

Dead tool surface is the most actionable of the five. Every tool definition the agent never calls is re-sent on every request, so an oversized surface costs money on every turn and degrades selection accuracy. The **score** uses the clean ratio. The **recommendation** shows an estimated cost, derived from `length(tool_definitions)` on a sample of chat spans and labelled as an estimate. A ratio is defensible in a formula, and a dollar figure is what makes a user act.

Duplicate tool work resolves in one query:

```sql
SELECT sum(cnt - 1) AS excess
FROM (
  SELECT session_id, tool_name, cityHash64(tool_input) AS args, count() AS cnt
  FROM spans
  WHERE operation = 'execute_tool' AND {scope}
  GROUP BY session_id, tool_name, args
)
WHERE cnt > 1
```

### Formula

```
Efficiency = sum(w_i * curve(m_i, good_i, poor_i)) / sum(w_i)   over applicable metrics
```

Control points, all provisional, all with equal weight in v1:

| Metric | good | poor |
| --- | --- | --- |
| Dead tool share | 0.20 | 0.70 |
| Cache efficiency | 0.80 | 0.30 |
| Duplicate tool work | 0.02 | 0.15 |
| Latency drift | 1.00 | 1.50 |
| Cost drift | 1.00 | 1.50 |

The cache poor point of 0.30 is the threshold the `low-cache-hit-rate` flagger already uses, so the two agree by construction.

### Applicability

Per metric, not per dimension:

- Dead tool share and duplicate tool work apply when the project offers or calls tools.
- Cache efficiency applies when caching is active, which is the gate the existing flagger implements: `tokens_cache_read + tokens_cache_create > 0` on multi-turn sessions.
- Latency drift and cost drift apply when the trailing baseline has at least `COHORT_P95_MIN_SAMPLES` (100) samples.

The dimension is not measured when no metric applies.

## 9. Safety

Whether the agent produced content or took an action it should not have.

Safety needs a distinction the other dimensions do not: exposure is not failure. Receiving a jailbreak attempt says nothing about the agent. Complying with one says everything. The flagger registry already encodes the difference. `classifiesAssistantResponseOnly` is `false` for `jailbreaking` and `nsfw`, which judge user-authored content. The assistant-side detectors judge what the agent produced.

Two consequences. First, `refusal` detects an *incorrect* refusal, so it belongs in outcome quality, not here. Second, every safety detector is an LLM flagger sampled at 10%, so Latitude has no denominator and can never publish a safety percentage.

### Metrics

| Metric | Source | Role |
| --- | --- | --- |
| Confirmed assistant-side failures: `pii-leakage` scores, promoted signals with `dimension = safety` | promoted signal set plus flagger scores | scored, as a cap |
| Sessions the safety flaggers actually classified | flagger screening decisions | denominator for the rate test |
| Exposure: `jailbreaking` and `nsfw` hits | flagger scores | context only, never scored |

### Formula

Safety is a ceiling on the composite rather than a weighted term:

```
cap = 100    when confirmedFailures = 0
cap = 80     when confirmedFailures >= 1
cap = 50     when confirmedFailures / classifiedSessions >= 0.01
```

The two cap values are provisional and need calibration against production data.

The panel never shows a safety percentage. It shows counts and the sampled denominator, for example "2 confirmed leaks in 412 classified sessions", plus the exposure line, for example "340 injection attempts received".

### Applicability

The cap always applies. The rate test applies only when `classifiedSessions >= BENCHMARK_MIN_SESSIONS`. A single confirmed failure still caps the score at any sample size, because one leak is one leak.

## 10. The composite

```
applicable = the dimensions that passed their applicability gates
Score      = 100 * min( sum(w_d * D_d) / sum(w_d) for d in applicable , cap / 100 )
```

Weights are 0.35 outcome, 0.30 reliability, 0.20 process, 0.15 efficiency, renormalized over the applicable set. A weighted mean lets a strong dimension offset a weak one, which is deliberate. The page below the number ranks the worst contributors, so a bad dimension is impossible to miss without adding a special case to the arithmetic.

The page shows which dimensions were scored and which were not, so a score computed over three dimensions never presents itself as a score over five.

## 11. Attribution and recommendations

The number is the headline. The list under it is the product. Every point the agent lost must trace to a named cause with the sessions that caused it, and the causes must rank by how much fixing each one returns.

The score decomposes exactly, so none of this is estimated.

### The deficit decomposes

Give every session a weight in its dimension: 1 when frustrated, 0.5 when tolerating, 0 when satisfied. The Apdex ratio is then a loss:

```
loss_d = sum over sessions of w(s) / N_d
```

and the points a dimension costs the composite are:

```
deficit_d = 100 * W_d * loss_d / sum of W over applicable dimensions
```

Those deficits sum to exactly `100 - Score`. Efficiency behaves the same way with a simpler shape, because its metrics do not overlap:

```
deficit_m = 100 * (W_efficiency / sum of W) * (w_m / sum of w) * (1 - curve(m))
```

Safety contributes the difference between the uncapped and the capped score.

### Two numbers per cause, because they answer different questions

Inside a dimension the causes overlap. One session can carry a terminal error, an unreliable finish reason, and a signal at the same time. Assigning the full weight to each cause would make the parts add up to more than the whole, and the page would claim more available points than exist.

So each cause carries two numbers.

**Share** splits an overlapping session's weight evenly across the causes on it. A session with three causes gives each a third. Shares sum to exactly the dimension's loss, which is what a stacked breakdown needs to be honest.

**Gain** is what the score recovers if this cause alone is fixed and nothing else changes:

```
gain_c = sum over sessions of [ w(s) - w(s without c) ] / sum over sessions of w(s)
```

A session frustrated only by `c` returns its full weight. A session frustrated by `c` that also has a tolerating-level cause returns half, because removing `c` demotes it rather than clearing it. A session frustrated by both `c` and `d` returns nothing, because it stays frustrated either way.

Gain is the ranking key. It is the only number that answers "what do I get for fixing this". It is also deliberately conservative. The individual gains sum to less than the total deficit, and the remainder is the overlap.

### The top-k preview

Because gains do not add, the page computes the union directly for whatever set the user selects:

```
gain_K = sum over sessions of [ w(s) - w(s without K) ] / sum over sessions of w(s)
```

That is what powers "fixing the top three takes you from 72 to 84". It is exact, not a projection.

### One query, sixty-four rows

None of this needs per-session storage. Each dimension emits a bitmask of which causes hit each session, and the query groups by the bitmask:

```sql
SELECT cause_mask, bucket, count() AS sessions
FROM ( ... per-session cause resolution ... )
GROUP BY cause_mask, bucket
```

A dimension has at most six causes, so the result is at most 64 rows regardless of project size. Share, gain, and any top-k union are all derivable from that table in application code. The table is small enough to store on the snapshot, which is what lets a frozen snapshot from four days ago still render its own breakdown.

### Ranking

Gain sorts the list. Three columns sit beside it, because points are not the only thing that matters:

| Column | Source |
| --- | --- |
| Affected sessions | the cause's session count |
| Cost | tokens and money in the affected sessions, from the session rollup |
| Trend | the cause's gain in this snapshot against the previous one |

A cause worth 3 points that burns 4,000 dollars a month can matter more than a cause worth 6 points that costs nothing. A cause worth 4 points and growing beats one worth 6 and shrinking. The list sorts by gain and the user can re-sort by any column.

### Recommendations

Recommendations come in two tiers, and the line between them is whether Latitude knows the fix or only knows where to look.

**Mechanical.** The metric definition determines the fix, so the text is exact and needs no model:

| Cause | Recommendation | Evidence |
| --- | --- | --- |
| Dead tool share | remove these definitions | the unused tool names, plus estimated tokens from `length(tool_definitions)` |
| Truncation | raise the output limit on this model | `spans.model` on the truncated spans |
| Duplicate tool work | this tool ran with identical arguments N times | the duplicate query's own grouping |
| Undefined tool call | the agent called a tool that is never defined | `tools` minus `defined_tools` |
| Low cache hit rate | caching is on but serves only N% of input tokens | `cacheHitRate` |
| Tool loop shape | this tool is N% of the calls in these sessions | the loop query |
| Schema validation failure | the flagger's own feedback text | `scores.feedback` |

**Evidence-backed.** For signals, Latitude does not know the fix, so it does not pretend to. It shows the signal's generated name and description, its example sessions, and where it concentrates. The concentration comes from `aggregateDimensionBySignal`, which already computes `P(signal | value)` against the base rate over `model`, `provider`, `tool`, `tag` and `finishReason`. "Four times more likely on model X" is a real lead and it costs nothing new.

A third tier, a model writing prose advice per cause, is deliberately out of scope. It is the part most likely to be wrong, it costs money on every project every day, and the two tiers above already carry the specifics. Section 16 keeps it as an option.

### Below the floor

Gain is a share of a deficit, so it needs the score to exist. Counts do not. Below `BENCHMARK_MIN_SESSIONS` the list still renders, ranked by affected sessions instead of by gain, with the recommendations unchanged.

## 12. Confidence

Confidence is a separate axis. It never enters the score.

| Input | Meaning |
| --- | --- |
| Eligible session count | sample size, drives the margin of error |
| Analyzed share | `analyzed / eligible`, how much of the traffic conversation intelligence could read |
| Success moment count | positive evidence seen, separate from absence of evidence |
| Muted or archived detectors | how much the project stopped Latitude from looking |
| Classified share for safety | sampled coverage of the LLM detectors |
| Unpriced span share | how much of the cost figure is estimated |
| Unmapped finish-reason share | how many generations Latitude could not classify as clean or unreliable |

### Margin of error

The interval is the **Wilson score interval** at 95%, not the normal approximation. The normal approximation is invalid at the sample sizes and score values this feature actually sees. It needs `n * (1 - p) >= 5`, which a project with 50 sessions and a score of 95 fails, and it can place the upper bound above 100. Wilson stays correct at every n and never leaves the range.

Half-width at a score of 85, and what one bad session costs:

| Eligible sessions | Interval | One session moves the score by |
| --- | --- | --- |
| 20 | ±15 | 5.0 |
| 30 | ±13 | 3.3 |
| 50 | ±10 | 2.0 |
| 100 | ±7 | 1.0 |
| 300 | ±4 | 0.3 |
| 900 | ±2 | 0.1 |

### Gates

The floor is `BENCHMARK_MIN_SESSIONS`, set to **30 eligible sessions in the chosen window**.

Thirty is where a single session stops dominating the result. It moves the score by 3.3 points, and the interval is ±13, which is wide but still says something useful. Below 20 one session is worth 5 points or more, the interval passes ±15, and the number is noise wearing a decimal point.

The floor is deliberately low. A higher one, say the 150 sessions where the interval reaches ±5, would hide the score from the user who wants it most. That is someone checking an agent's quality before shipping it. It would also treat a wide interval as a reason to show nothing, when the interval is itself the information. A number with an honest ±13 beside it misleads no one. "Come back later" just blocks them.

- Below 30 eligible sessions in the widest window, Latitude shows "collecting" and the session count instead of a number.
- The number carries a **provisional** badge whenever the Wilson half-width is over 5 points, which lands near 150 sessions. The badge tracks the interval rather than a session count, so it stays correct for a project scoring 99 as well as one scoring 60.

### The page still works below the floor

Hiding the number does not mean hiding the page. Every diagnosis on it is a count, not a rate, and counts are honest at any sample size. Ten sessions with two thrashing loops and a truncated response is worth reading, and it is exactly what a pre-launch user wants.

So below the floor Latitude renders the full diagnosis list, the dimension evidence, and the recommendations. It withholds only the composite and the dimension sub-scores. The page reads "collecting, 18 of 30 sessions" above a list of what it already found.

## 13. Invariance rules

These are hard rules. A change that breaks one is a bug, not a tuning choice.

1. **No human workflow action changes the score.** Priority, assignee, resolve, unresolve, regress, mute and signal feedback are organizational state. They may change what the page shows and how it sorts. They never change the arithmetic. A user who triages must not score worse than a user who ignores.
2. **Muting or archiving a detector lowers confidence, it never raises the score.** Ignoring a signal archives its detector, so occurrences stop by construction. Latitude reports the loss of visibility rather than crediting it as an improvement.
3. **The score is never tied to pricing, quota, or an SLA.** Any of those teaches customers to stop instrumenting their failures.
4. **A dimension with no evidence is not measured.** It never defaults to 100.
5. **The daily snapshot is immutable.** Section 14 explains why.

## 14. Storage and computation

### Daily snapshot

A scheduled job computes the score once a day at a fixed UTC hour, over the window the ladder chose, using the signal set that was promoted as of `D`. It writes one row and never rewrites it.

The freeze is load-bearing. `PROMOTION_WINDOW_DAYS` is 30 while the score window is 7 days for most projects. A signal can therefore promote today on evidence a month old, and deduct points from traffic that already happened. A live query would silently rewrite last Tuesday's score, which destroys trust in the number faster than any formula flaw.

### Row shape

One row per project per day, in Postgres:

- the composite score, the cap that applied, and the applicable dimension set
- the window length the ladder chose, and the eligible session count behind it
- each dimension's sub-score and its bucket counts
- each dimension's cause-mask table, the at-most-64-row grouping from section 11 that makes attribution reproducible from the frozen row
- each efficiency metric's raw value
- the confidence inputs
- `scoring_version`, stamped on every row

The breakdown must render from the stored row rather than from a live re-query, otherwise a snapshot from four days ago cannot be explained. Metric inputs and the cause-mask tables go in a JSONB column. Both are bounded by construction, so the row stays small no matter how much traffic the project sees.

### Scoring version

Every improvement to detection lowers scores with no change to the agent. `scoring_version` on the row makes that legible. When the version bumps, the page marks the discontinuity and Latitude publishes what changed. Lighthouse versions its scoring the same way.

### Query budget

Roughly three ClickHouse passes per project per day, plus one Postgres read for the promoted signal set. One pass reads the session rollup, one reads the trace rollup for the terminal failure test, and one reads spans at row grain. The span pass covers tool loops, duplicate tool work and finish reasons together, so those three metrics share a scan. Most reads reuse existing repositories.

## 15. Enabling changes

### 15.1 Small additions

| Change | File | Reason |
| --- | --- | --- |
| Expose `finishReasons` as a span filter field | `registries/span-fields.ts` | unreliable finish reasons feed reliability, and users need to filter to them from the diagnosis list |
| Add the finish-reason classifier | `@domain/spans` | one shared clean / unreliable / unknown list for the score, the registry and the UI |
| Scope signal metrics to promoted signals | `variant-metrics-repository.ts` | `signals.affected_sessions_rate` currently counts unpromoted candidates, so it overcounts today |

### 15.2 The signal dimension

Every promoted signal carries one dimension: `outcome`, `reliability`, `process`, `efficiency`, `safety` or `none`. The dimension decides which session set the signal joins.

**Assignment is latched at promotion and never regenerated.** `refreshSignalDetails` reruns generation every 8 hours on every promoted signal. A dimension that can flip would move points between dimensions with no change to the agent. The write-once pattern matches `slug`, `origin` and `promotedAt`.

**Most signals never call the model.** `annotationScoreMetadata.flaggerSlug` is on every flagger-authored score. When one slug dominates a signal's occurrences, the dimension comes from a static table:

| Flagger | Dimension |
| --- | --- |
| `tool-call-errors`, `output-schema-validation`, `empty-response` | reliability |
| `trashing`, `forgetting`, `bluffing` | process |
| `incompletion`, `laziness`, `refusal`, `frustration` | outcome |
| `low-cache-hit-rate` | efficiency |
| `pii-leakage` | safety |
| `jailbreaking`, `nsfw` | safety, marked as exposure |

Only mixed signals and human-annotation-origin signals reach the model. For those, `dimension` joins `signalDetailsSchema` in the existing generation call, so no extra request is needed.

The static table also gives a free historical backfill. Every flagger-derived signal classifies with zero model calls, and only the annotation-origin tail needs a pass.

**Routing per dimension:**

- `outcome`, `reliability` and `process` signals join their dimension's session set and change the score.
- `efficiency` signals are diagnostic only. Efficiency is measured in tokens and money, so mixing a defect rate into it would mix units.
- `safety` signals trip the cap.
- `none` routes to outcome. Outcome is the residual category by nature, and a real defect that escapes the score silently is worse than one in a slightly wide bucket. The page marks it unclassified.

## 16. Open questions

1. **Window ladder flapping.** A project sitting near 300 sessions a week can alternate between the 7 day and 14 day step from one day to the next. Both scores are honest, but the trend line gets noisy. If that shows up in practice, add hysteresis. Widen at the target and narrow only at some margin above it, the way the escalation detector already separates its entry and exit thresholds.
2. **`BENCHMARK_TARGET_SESSIONS` at 300.** The ladder targets 300 because that is where the interval reaches ±4 and the score becomes precise enough to act on week over week. It is a judgement call and belongs in the same calibration pass as the control points.
3. **Control point calibration.** Every `good` and `poor` value in section 8, both cap values in section 9, and the 0.25 representativeness gate in section 5 are judgement calls. Lighthouse derives its equivalents from corpus percentiles, and Latitude has the equivalent corpus in ClickHouse. Run the score in shadow for two weeks, then set the control points from fleet percentiles and publish the method.
4. **`bluffing` placement.** Claiming success after a failed tool call is a trajectory defect, which argues for process, but the user experiences a wrong answer, which argues for outcome. Currently assigned to process because the fix is process shaped.
5. **`escalation` as a strong failure moment.** A handoff to a human means the agent did not resolve the session, so section 5 counts it as a failure. A support team that designs for handoff will disagree. Revisit once real projects react to it, and consider making this one kind configurable per project.
6. **Finish-reason vocabulary drift.** The lists in section 6 are enumerated by hand from the providers Latitude sees today. A new provider or a new value lands in the unknown class, which is safe but silent. Add a periodic check that reports the top unmapped values across the fleet, so the lists stay current without anyone remembering to look.
7. **`refusal` and `pause_turn` as clean.** Both are deliberate model behaviour rather than a broken run, so section 6 leaves them out of the unreliable list. If real data shows `pause_turn` sessions that never resume, that becomes a terminal failure and moves.
8. **Moment confidence floor.** `session_moment_labels.confidence` is persisted per label. The classifier already validated every persisted label, so v1 applies no second floor. Revisit if false positives show up in the outcome bucket.
9. **The `escalating` signal state.** This is the one system-derived signal state, so it is legitimate under section 13. A session set has no natural place for a multiplier, so v1 uses escalation to rank the diagnosis list rather than to change the score.
10. **Behaviour clusters as a diagnosis breakdown.** The score is one number per project and stays that way. The open question is whether the page should also rank behaviour clusters by how much of the lost score each one carries.

   Part of this already exists on the Behaviours page. `getClusterAggregate` returns a `momentKindDistribution` per cluster, and `getClusterTrajectory` charts escalation, resolution, churn risk and wins over a day or turn axis. So "which behaviours see the most frustration" is answered there today, and repeating it here would be duplication.

   What is missing there is everything except moments. Behaviours has no per-cluster Signal prevalence, no error or tool-failure rate, no cost, and no ranking by contribution. A user cannot currently learn that refund sessions carry 60% of the reliability failures while being 12% of the traffic.

   So the version worth building is the part Behaviours cannot answer: reliability, process and efficiency per cluster, ranked by lost points. The session sets support it already through the `topics` filter, which resolves through the same `buildSessionIntelligenceFilters` path the rest of the score uses. Scope it to that delta, or drop it.
11. **Denormalizing the terminal failure test.** Section 6 computes it with an extra grouped read. A rollup column on `sessions_mv` would save the pass. Do it only if the daily job gets slow.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Enabling changes

- [ ] **P1-1**: Add the finish-reason classifier to `@domain/spans` and expose `finishReasons` on the span field registry.
- [ ] **P1-2**: Scope `signals.*` metrics in `variant-metrics-repository.ts` to promoted signals.

**Exit gate**:

- `finishReasons` filters correctly under the existing analytics tests.
- The classifier has a table-driven test covering every value in section 6, plus the uppercase and unmapped cases.
- `signals.affected_sessions_rate` no longer counts unpromoted candidates, with a regression test.

### Phase 2 - Signal dimension

- [ ] **P2-1**: Add the `dimension` column to the signal row, the entity schema, and the public API shape.
- [ ] **P2-2**: Add the static flagger to dimension table and resolve the dimension from the dominant slug.
- [ ] **P2-3**: Add `dimension` to `signalDetailsSchema` for signals with no dominant slug. Latch it at promotion only.
- [ ] **P2-4**: Backfill existing promoted signals, static table first, model pass for the annotation-origin tail.

**Exit gate**:

- Every promoted signal in a seeded project carries a dimension.
- `refreshSignalDetails` provably does not change an existing dimension.

### Phase 3 - Measurement core

- [ ] **P3-1**: Build the five dimension readers as one use case per dimension, each returning bucket counts or raw metric values.
- [ ] **P3-2**: Build the composite, the cap, the applicability gates and the weight renormalization.
- [ ] **P3-3**: Build the cause-mask grouping per dimension, plus share, gain and the top-k union.
- [ ] **P3-4**: Build the confidence inputs and the margin of error.
- [ ] **P3-5**: Add the snapshot table, the daily job, and `scoring_version`.

**Exit gate**:

- The score computes end to end for a seeded project against known fixtures.
- Dimension deficits sum to exactly `100 - Score`, and per-cause shares sum to exactly their dimension's loss. Both asserted in tests.
- Re-running the daily job for the same date is a no-op.
- A project below 30 eligible sessions returns "collecting" rather than a number, and still returns its diagnosis list.
- The window ladder picks 7, 14 or 30 days correctly at each boundary.

### Phase 4 - The page

- [ ] **P4-1**: Score, margin of error, confidence, and the dimension breakdown.
- [ ] **P4-2**: The ranked diagnosis list: gain, share, affected sessions, cost and trend per cause, with links to the sessions.
- [ ] **P4-3**: Mechanical recommendations per section 11, and the evidence-backed panel for signals using `aggregateDimensionBySignal`.
- [ ] **P4-4**: The top-k preview, showing the exact union gain for a selected set of causes.
- [ ] **P4-5**: The daily trend chart, so a fix is visible on day one even though the score lags by the whole window.

**Exit gate**:

- Every lost point on the page links to the sessions that lost it.
- The top-k preview matches a recomputed score with those causes removed.
- A project with a not-measured dimension renders the reason, not a blank.

### Phase 5 - Calibration

- [ ] **P5-1**: Run the score in shadow for two weeks across the fleet.
- [ ] **P5-2**: Set the control points and cap values from fleet percentiles. Publish the method.

**Exit gate**:

- No control point in the code is a judgement call without a recorded percentile behind it.
