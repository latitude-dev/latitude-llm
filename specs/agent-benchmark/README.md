# Agent score

> **Status**: design. No code is written.
>
> **Durable homes after this stabilizes**: `dev-docs/signals.md` for the signal dimension list,
> `dev-docs/flaggers.md` for the flagger changes, `dev-docs/conversation-intelligence.md` for
> moments as outcome evidence, `dev-docs/spans.md` for the metric reads, and a new
> `dev-docs/agent-benchmark.md` for the score itself.

## The problem

Latitude tells a user what happened in one session, in one trace, or under one signal. It does not
tell the user how the agent is doing.

To answer "is my agent good?" today, a user must read several pages and combine them by hand. The
Signals page shows defects but not their share of traffic. The Sessions page shows volume, cost and
latency but says nothing about quality. Tools, Memory and Behaviors each show one slice. None of
them compare this week to last week. None of them rank problems by how much each one costs. A team
can ship a change, watch every page stay green, and never learn that the agent got worse.

## What we are building

One page with one number from 0 to 100. Latitude computes the number the same way for every
project, from telemetry the platform already stores. The number moves when the agent changes.

The page below the number explains every point the agent lost. Each lost point traces to a named
cause, the causes rank by how much fixing each one returns, and every cause links to the page where
a user can act on it. The score is the headline. The ranked list is the product.

## The five dimensions

The score is a weighted mean of five dimensions. Each dimension answers one question, and each has
a page in the app where a user goes to act.

| Dimension | Question | Where the user goes |
| --- | --- | --- |
| Outcome | Did the agent do what it was asked to do? | Behaviors, Signals |
| Reliability | Can the agent succeed every time? | Sessions, Tools |
| Cost | Does the agent waste money? | Cost |
| Speed | Does the agent waste time? | Sessions, Tools |
| Safety | Did the agent expose or produce something it should not have? | Signals, Settings |

Outcome carries the largest weight. It is the only dimension that measures what the agent achieved
rather than how it behaved, and it is the fallback for any signal with no other dimension.

Cost and Speed do not measure how cheap or how fast the agent is. A coding agent that runs for ten
minutes is not worse than a chatbot that answers in two seconds. They measure **waste**: money
spent on work that produced nothing, and time spent on steps the task did not need. That question
has the same answer for every use case.

A metric or a signal can belong to more than one dimension. Thrashing wastes money and wastes time,
so it lowers Cost and Speed together. The overlap is deliberate. An item that damages two
dimensions costs more than one that damages one, which is correct.

## The five rules

These rules decide what may enter the score. A metric that breaks one is reported on its page
instead. Every rule exists because the score must mean the same thing for a support chatbot, a
batch classifier and a coding agent.

**1. Rates, not counts.** Every metric measures a share of sessions. One bad session in ten
thousand is not the same as four in five, and a count treats them alike. A count also rises when
traffic grows or when Latitude ships a better flagger, neither of which is the agent getting worse.
Safety is the one exception, because one confirmed data leak matters at any volume.

**2. No absolute values.** No cost, latency, token count or volume figure enters the score at its
face value. Some agents must reply in under a second. Others run for an hour and that is correct.
Any threshold that separated them would be a statement about one use case.

**3. No comparison against the project's own past.** The score depends on the window it covers and
on nothing earlier. A drift metric would break this in three ways. A project cloned from another
starts with no baseline, so it scores higher for behaving identically. A defect that was fixed and
came back costs more the second time than the first. A project that degrades slowly never triggers
drift, because its baseline follows it down. Monitors already detect regressions, and the score's
own daily history already shows whether the agent improved.

**4. No tunable constants.** Some metrics have a healthy non-zero value. An agent that checks
memory before writing, and correctly finds nothing, is behaving well. A threshold on zero-hit
searches would cap that agent below 100 with nothing it could do. Such a metric enters the score
only through one of the four forms in [`metrics.md`](metrics.md), or it stays out.

**5. Only observable evidence moves the score.** A dimension whose denominator is too small is not
measured, and it never defaults to 100. A muted or archived flagger lowers confidence rather than
raising the score, because occurrences stopping by construction is not the same as the defect going
away. A flagger that samples without recording what it examined cannot produce a rate at all.

## Terms

The documents use one word per concept and never vary it.

| Term | Means |
| --- | --- |
| score | the global number from 0 to 100 |
| dimension | one of the five: Outcome, Reliability, Cost, Speed, Safety |
| metric | one measured thing, with an ID such as `tools.thrashing` |
| signal | a Latitude signal |
| flagger | a Latitude flagger |
| session | a session |
| eligible session | a session that counts in the denominator |
| window | the period the score covers |
| snapshot | the frozen daily row that holds one day's score |
| ruined | a session that ended badly, counted at full weight |
| degraded | a session that hit trouble and recovered, counted at half weight |
| fleet baseline | percentiles measured across every Latitude project |

## The documents

Read them in this order. Each one assumes only the documents above it.

| Document | Contents |
| --- | --- |
| [`score.md`](score.md) | How the number is computed and stored, and what each dimension means and contains |
| [`metrics.md`](metrics.md) | Every metric: what it measures, how it is read, and what stops it firing on missing telemetry |
| [`signals.md`](signals.md) | How a signal gets its dimensions, and which signals count |
| [`flaggers.md`](flaggers.md) | What must change in flaggers before some metrics can be read correctly |
| [`page.md`](page.md) | What the page shows |
| [`plan.md`](plan.md) | The phases, in order, with exit gates |

## What changes outside this feature

The score needs four changes to systems it does not own. Each one is useful on its own.

| Change | Why | Detail |
| --- | --- | --- |
| A signal carries a list of dimensions, assigned when it is promoted | A signal must know which dimensions it lowers | [`signals.md`](signals.md) |
| Three flaggers get correctness fixes | Two of them currently fire on absent telemetry rather than on agent behaviour | [`flaggers.md`](flaggers.md) |
| Flagger screening decisions are stored | Without them, no sampled flagger has a denominator, so Safety cannot be a rate | [`flaggers.md`](flaggers.md) |
| A new flagger separates a prompt injection that worked from one that was only attempted | `jailbreaking` reports both in one verdict, so scoring it would penalize an agent for having hostile users | [`flaggers.md`](flaggers.md) |

## The numbers

Each value is explained where it is defined. This table is the index.

| Setting | Value | Defined in |
| --- | --- | --- |
| Window steps | 7, 14, 21 or 28 days, the shortest that holds the target | [`score.md`](score.md#the-window) |
| Session target | 1000 eligible sessions | [`score.md`](score.md#why-the-target-is-1000-sessions) |
| Session floor | 200, below which no score is shown | [`score.md`](score.md#the-floor) |
| Dimension weights | Outcome 0.35, Reliability 0.25, Cost 0.15, Speed 0.15, Safety 0.10 | [`score.md`](score.md#the-composite) |
| Per-term weights | Cost union 0.50, Speed union 0.60, each remaining term splits the rest | [`score.md`](score.md#how-a-dimension-produces-a-score) |
| Safety cap | a confirmed failure caps the composite at 80 | [`score.md`](score.md#a-confirmed-failure-also-caps-the-composite) |
| Fleet control points | good at the fleet median, poor at the fleet 95th percentile | [`metrics.md`](metrics.md#the-two-control-points) |
| Signal dimension cap | at most two dimensions per signal | [`signals.md`](signals.md#the-dimension-list) |

## Open questions

1. **The Safety deduction per failure type.** Safety starts at 100 and each distinct confirmed
   failure type lowers it. The cap at 80 carries most of the weight, so the deduction can be
   moderate. The exact value belongs to the calibration phase.
2. **The fleet distributions.** `spans.ttft` and `spans.throughput` need percentiles that do not
   exist yet. Both stay unmeasured until the aggregation job runs. Two smaller choices come with it:
   which of `model` and `response_model` is the more stable cohort key, and what counts as a shift
   large enough to recompute the points and bump the scoring version.
3. **Behavior clusters.** This is two features. Comparing a metric inside one topic cluster would
   admit dispersion, which is deferred and explained in [`metrics.md`](metrics.md). Showing which
   clusters carry the lost points changes no arithmetic and is a page feature for a phase after the
   page ships. The Behaviors page already answers the moment half and has no version of the rest: no
   per-cluster signal prevalence, no error rate, no cost, no ranking by contribution.
4. **Whether the weights should be fitted rather than chosen.** Human annotations are the one ground
   truth in the platform, so the weights could be fitted to maximise agreement between the score and
   human verdicts on the same sessions. Annotation coverage is small and self-selected, so the fit
   would carry that bias. Kept as a calibration option.
