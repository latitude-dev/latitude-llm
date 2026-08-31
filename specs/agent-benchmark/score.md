# The score and the dimensions

> Read [`README.md`](README.md) first. It defines the five dimensions, the five rules and every
> term used here.

Part one covers the number: what it answers, how it is computed, and how it is stored. Part two
covers the five dimensions: what each one means and which metrics it contains.

---

# Part one: the number

## What the number answers

The score answers one question. **What share of this agent's sessions went cleanly?**

It does not claim the agent gave correct answers. Correctness needs ground truth, and most projects
have none. Latitude can see every trace, every tool call, every error, every user reaction and
every defect its own flaggers found. A session goes cleanly when none of that evidence shows
trouble.

Three consequences follow.

The session is the unit. A session with twenty failing spans counts once. Any lost point leads to
the sessions that lost it.

Only observed behaviour counts. A user who triages signals must not score worse than a user who
ignores them.

Absence of evidence is not a pass. A project with no conversational sessions gets no Outcome score
rather than a perfect one.

## Eligible sessions

The eligible base is every session in the window with LLM activity. The session field registry
already exposes this as `hasLlmActivity`, which is `tokens_total > 0 OR length(models) > 0`.
Instrumentation-only sessions and idle sessions stay out.

Sessions with a `simulation_id` are excluded. Simulations are test runs against curated cases, so
they belong to experiments rather than to a production score.

Each dimension then narrows the base to its own denominator. Part two names them.

## The window

The window is not fixed. A team that runs a million sessions a week wants a number that reacts
within days. A team testing an agent before launch runs thirty sessions a week and wants a number at
all. One window length cannot serve both.

Latitude picks the shortest step that holds at least 1000 eligible sessions.

| Step | Used when |
| --- | --- |
| 7 days | the trailing week holds 1000 or more eligible sessions |
| 14 days | the week does not, but the fortnight does |
| 21 days | neither does, but three weeks do |
| 28 days | none of the shorter steps do |

A project above roughly 143 sessions a day stays on the 7 day step and reacts fast. A quieter project
widens and gets a stable number instead of no number. The practical entry point is about 7 sessions a
day, which reaches the floor of 200 sessions in four weeks.

### Why the target is 1000 sessions

The target decides how precise the number is once a project is large enough to reach it. At 1000
sessions the interval is about 2.2 points and one session moves the score by a tenth of a point, which
is what a daily trend line needs to be readable rather than jittery. The interval table under
[Confidence](#the-interval) gives the full picture.

A lower target such as 300 sessions produces an interval near 4 points. A real week-over-week
improvement of 3 points would then be hard to distinguish from noise, which defeats the purpose of a
number a team is meant to act on.

The target only decides the window for projects below about 143 sessions a day. Above that, the 7 day
step already holds more than 1000 and the extra precision is free.

### Why the steps are whole weeks

Most products have a strong weekly rhythm. Volume, question mix and user patience all differ between a
Saturday and a Tuesday. Day-of-week effects cancel exactly at any whole number of weeks, so a window
of 7, 14, 21 or 28 days compares like with like. A 10 day window covers one week plus three days, so
it over-weights three days of the week.

This is also why the shortest step is a week rather than two or three days. A shorter window reacts
faster, and the temptation is real, but it has a measurement problem the number itself cannot reveal.
With a 2 day window, Monday's snapshot covers the weekend and Wednesday's covers midweek. Those are
different populations, so the score moves for reasons that have nothing to do with the agent, and the
trend line develops a weekly sawtooth.

The interval gives no warning about this. An interval measures sampling noise, and this is composition
noise. A 2 day window holding 2000 sessions reports an interval near 1.5 points while the true
week-over-week swing from traffic mix can be 5.

Consecutive snapshots make it worse. With a 7 day window two consecutive snapshots share 6 of their 7
days, so the trend is smooth by construction. With a 2 day window they share 1 of 2.

A 7 day window still shows a fix arriving. A cause worth 10 points shows about 1.4 points the next
day, 4.3 by the third day, and all 10 by the seventh.

### Why the steps are fixed rather than continuous

A window that could be any number of days would change its own length as traffic fluctuates, so the
score would move partly because its basis moved rather than because the agent did. Four fixed steps
change rarely, and a change is legible when it happens.

Taking exactly the most recent 1000 sessions with no time bound is tempting for a different reason:
every busy project would have identical precision. It fails on traffic spikes. A project that
temporarily runs ten times its usual volume would have its whole window compressed into one
unrepresentative day.

### Hysteresis

Shorten the window only when the shorter step holds comfortably more than 1000 sessions. Lengthen only
when the current step falls below it.

Without a gap between the two thresholds, a project sitting near a boundary alternates between two
lengths from one day to the next. Both numbers are honest and the trend line is still noisy. The
escalation detection already separates its entry and exit thresholds for the same reason.

The chosen step is stored on the snapshot and shown next to the score, and the trend chart marks a
change, because a score over 28 days and a score over 7 days answer slightly different questions.

## How a metric produces a loss

Every metric produces a loss between 0 and 1. Metrics come in three shapes, and each shape computes
its loss differently.

**A session metric** classifies each session in its denominator as `ruined`, `degraded` or clean.

```
loss = (ruined + 0.5 * degraded) / denominator
```

The half weight for `degraded` is the recovery distinction. Agents retry constantly and succeed.
Scoring a successful retry as a failure is wrong. Scoring it as clean throws away real information.

**A ratio metric** compares what the project achieved against what it could have achieved.

```
loss = 1 - (achieved / achievable)
```

`cost.cache_gap` and `tools.dead_surface` have this shape. The achievable value is measured from the
project's own data, so a project with nothing left to improve has a loss of 0.

**A baseline metric** compares the project's value against percentiles measured across every
Latitude project for the same provider and model. `spans.ttft` and `spans.throughput` have this
shape. [`metrics.md`](metrics.md) covers the mechanism.

## How a dimension produces a score

Session metrics inside one dimension **union** into a single loss. A session is `ruined` if any of
the dimension's session metrics marks it ruined. It is `degraded` if any marks it degraded and none
marks it ruined. A session found by two metrics is one affected session, not two.

The union is what makes double counting impossible inside a dimension. A defect that both a metric
and a signal detected costs the same as one only the metric detected.

The dimension score is then the weighted mean of the union loss and each ratio or baseline loss.

```
dimension = 100 * (1 - weighted mean of [ unionLoss, ratioLoss_1, ..., baselineLoss_n ])
```

Outcome and Reliability hold only session metrics, so each has one term and needs no per-term weight.
Cost and Speed have three terms each.

| Dimension | Union of session metrics | Each remaining term |
| --- | --- | --- |
| Cost | 0.50 | 0.25 each for `cost.cache_gap` and `tools.dead_surface` |
| Speed | 0.60 | 0.20 each for `spans.ttft` and `spans.throughput` |

The union dominates in both, and it dominates more in Speed.

Weighting the three terms equally would break Speed. It would make `spans.ttft` and
`spans.throughput` two thirds of the dimension, leaving all nine behaviour metrics to share the
remaining third. Speed measures whether the agent reaches its goal by the shortest route it could have
taken, not how fast the model reads, so the behaviour metrics have to outweigh the latency ones.

Cost gives its union a smaller share than Speed does, because its two ratio metrics carry most of the
real money. An oversized tool surface re-sent on every request, and a cache serving a fraction of what
it could, are usually larger sums than the per-session waste.

One consequence is worth knowing. A metric's real weight is the sum across every dimension it sits in,
so the most a single metric can cost the composite varies widely.

| Metric | Dimensions | Maximum points |
| --- | --- | --- |
| `moments.strong_failure` | Outcome | 35 |
| `tools.structural_defect` | Reliability, Speed | 34 |
| `tools.thrashing` | Cost, Speed | 16 |
| `cost.cache_gap` | Cost | 4 |
| `tools.dead_surface` | Cost | 4 |

The last two are the largest money items and the smallest point items. The cause list ranks by money
as well as by points, so a user still sees them, but the score itself reacts only mildly to the most
expensive fixable thing on the page. This is accepted rather than solved. Raising their weight would
mean claiming that a wasteful tool surface matters more to agent quality than a user having to correct
the agent, and that is not true.

Safety does not use this shape. Its section in part two explains why.

## The composite

```
score = weighted mean of the dimensions that were measured
```

| Dimension | Weight |
| --- | --- |
| Outcome | 0.35 |
| Reliability | 0.25 |
| Cost | 0.15 |
| Speed | 0.15 |
| Safety | 0.10 |

Outcome is largest because it is the only dimension that measures what the agent achieved rather than
how it behaved. It also carries every signal that no rule assigned elsewhere, so it holds the residual.

Reliability is second because every metric in it is deterministic at full coverage. It is the dimension
Latitude can state with the most confidence.

Cost and Speed are equal. Neither is more important than the other in general, and a project that
cares more about one can read that dimension directly.

Safety is smallest as a weight and does not depend on the weight for its bite, because a confirmed
failure also caps the composite.

The values above are starting points, not settled numbers. They live in one place with the scoring
version, so changing them is one edit and one version bump, and the version marks the discontinuity on
the trend chart.

The standard they have to reach is this: once the score has run across real traffic, no weight and no
control point should remain a judgement call. Each one should have a measured figure behind it, and the
method should be published. Until then every value here is explicitly provisional.

There is one way to derive these rather than choose them. Human annotations are the only ground truth
in the platform: a thumbs-down with feedback is a person saying a session was bad. The weights could be
fitted to maximise agreement between the score and human verdicts on the same sessions. Annotation
coverage is small and self-selected, so the fit would carry that bias, which is why it is a calibration
option rather than the starting point.

A weighted mean lets a strong dimension offset a weak one. That is deliberate. The page below the
number ranks the worst causes, so a bad dimension is impossible to miss without adding a special
case to the arithmetic.

## Overlap between dimensions is intended

A metric can belong to more than one dimension. `tools.thrashing` sits in both Cost and Speed,
because it wastes money and it wastes time.

An item in two dimensions therefore lowers the composite roughly twice as much as an item in one.
This is correct. An agent that burns money and burns time is worse than one that only burns money.
The damage is real in both places, so it is counted in both places.

One consequence needs watching. A signal's dimension list decides how much it costs, and part of
that list can come from a model. A list that grows without reason becomes a severity multiplier
nobody chose. [`signals.md`](signals.md) caps the list length for that reason.

## When a dimension is not measured

Each dimension has a denominator and a floor. Below the floor the dimension is not measured, and the
weights redistribute over the dimensions that were.

A dimension is never scored 100 for lack of evidence. A batch classifier has no user turns, so
Outcome has almost no analyzed sessions and reports itself unmeasurable. An agent with no tools has
no tool sessions, so most of Speed drops out. Both results are correct.

The page names which dimensions were measured and which were not, so a score over three dimensions
never presents itself as a score over five.

## Confidence

Confidence is a separate axis. It never enters the score.

| Input | Meaning |
| --- | --- |
| Eligible session count | sample size, which drives the interval |
| Analyzed share | how much of the traffic conversation intelligence could read |
| Screened share per flagger | how much of the traffic each sampled flagger examined |
| Muted or archived flagger count | how much the project stopped Latitude from looking |
| Unmapped finish reason share | how many generations Latitude could not classify |
| Unpriced span share | how much of the cost figure is estimated |
| Measured token share | how much of the traffic has a cache ceiling |
| Observation age and active flagger count | how much a new project's clean reading can be trusted |
| Positive moment count | how much evidence Latitude saw of sessions going well |

### Why observation age is a confidence input rather than a gate

A new project has no promoted signals, so the metrics that depend on one read cleaner than reality.

The gap is narrower than it first looks. The deterministic flaggers reach the score through their own
metrics rather than through signals, so `tools.call_failed`, `tools.structural_defect`,
`tools.thrashing` and `sessions.no_output` all work on a project's first day. Only the model-driven
flaggers need a promoted signal first.

The window mostly closes what remains. Promotion counts evidence over 30 days. A busy new project
reaching 1000 sessions in a week detects roughly 10 sessions of a defect present in 10% of traffic,
which clears promotion. A quiet project sits on the 28 day step, which roughly matches the promotion
window, so the two line up.

What is left is a project in its first days whose signals have not finished clustering. That is hours
to days, so it belongs in the confidence panel rather than in a gate on the score. Raising flagger
sampling for a project's first weeks would compress it further at a bounded cost, and it is
unnecessary once the window adapts.

### The interval

The interval is the Wilson score interval at 95%. The normal approximation is invalid at the sample
sizes this feature sees. It needs `n * (1 - p) >= 5`, which a project with 50 sessions and a score
of 95 fails, and it can place the upper bound above 100. Wilson stays correct at every sample size
and never leaves the range.

Half-width at a score of 85, and what one bad session costs:

| Eligible sessions | Interval | One session moves the score by |
| --- | --- | --- |
| 100 | 7.0 | 1.0 |
| 200 | 5.0 | 0.5 |
| 300 | 4.0 | 0.3 |
| 1,000 | 2.2 | 0.1 |
| 5,000 | 1.0 | 0.02 |

The floor of 200 and the target of 1000 both come from this table. At 200 the interval is as wide as a
published number should be. At 1000 one session moves the score by a tenth of a point, which is what a
daily trend line needs to be readable.

### The floor

The floor is 200 eligible sessions in the widest step. Below it Latitude shows no score.

Two independent arguments land on 200, which is the reason to trust it.

The interval at 200 sessions is about 5 points, which is the widest a published number should be.
Below that a single session moves the score by more than half a point, and the reading stops
supporting a decision.

200 is also where the detection machinery starts working at all. A defect present in 10% of traffic,
examined by a flagger sampling at 10%, produces about 2 detected sessions in 200. That is exactly the
promotion floor, so below 200 sessions a real recurring defect cannot become a signal and cannot reach
the score. A number computed without it would be confidently wrong rather than merely imprecise.

A much lower floor is tempting, because the user who wants the score most is someone checking an agent
before shipping it. It does not help them. At 30 sessions the interval is 13 points and no defect can
have promoted, so the number would mislead rather than inform. That user is served instead by the page
still working below the floor, which the last section of part one covers.

There is no provisional badge. The floor already guarantees an interval of 5 points or better, so a
badge tracking the interval would fire in a band a few sessions wide and never be seen. The interval
is displayed next to the score at all times instead.

## The daily snapshot

A scheduled job computes the score once a day at a fixed UTC hour. It writes one row and never
rewrites it.

The freeze is load-bearing. Signal promotion counts evidence over 30 days, while the score window is
7 days for most projects. A signal can therefore be promoted today on evidence a month old, and
lower the score for traffic that already happened. A live query would silently rewrite last
Tuesday's score, which destroys trust in the number faster than any formula flaw.

The row holds:

- the score, and which dimensions were measured
- the window step that was chosen, and the eligible session count behind it
- each dimension's score and its loss terms
- each dimension's cause table, so the breakdown renders from the frozen row
- each ratio and baseline metric's raw value
- the confidence inputs
- `scoring_version`

The breakdown must render from the stored row rather than from a live re-query. Otherwise a snapshot
from four days ago cannot explain itself. Both the metric values and the cause tables are bounded by
construction, so the row stays small no matter how much traffic the project sees.

Re-running the job for a date that already has a row is a no-op.

## The scoring version

Every improvement to detection lowers scores with no change to any agent. Adding a flagger, fixing a
flagger, or changing a weight all do this.

`scoring_version` is stamped on every snapshot. When the version changes, the trend chart marks the
discontinuity and Latitude publishes what changed. Comparison across projects at one point in time
is unaffected, because every project runs the same version.

## How lost points trace to causes

The score decomposes exactly, so none of the page's numbers are estimated.

A dimension's loss is what it cost the composite:

```
deficit = 100 * dimensionWeight * dimensionLoss / sum of measured weights
```

Those deficits sum to exactly `100 - score` when no safety cap applies. When a cap applies, the
deficits sum to `100 - uncapped score`, and the cap contributes the remaining difference as its own
row. The page names it, so the arithmetic still closes and the user can see that the ceiling came from
a safety finding rather than from a dimension.

The cap also bounds the top-k preview. A set of causes worth 12 points cannot return 12 if the cap
holds the score at 80, so the preview reports what the cap will actually release. Otherwise it
promises points no fix can deliver.

Inside a dimension the causes overlap. One session can carry a failed tool call, a truncated
response and a signal at the same time. Giving each cause full credit would make the parts add up to
more than the whole. So each cause carries two numbers, because there are two questions.

**Share** splits an overlapping session's weight evenly across the causes on it. A session with
three causes gives each one a third. Shares sum to exactly the dimension's loss, which is what a
stacked breakdown needs to be honest.

**Gain** is what the score recovers if this cause alone is fixed and nothing else changes.

```
gain = sum over sessions of [ weight(s) - weight(s without this cause) ] / sum of weight(s)
```

A session ruined only by this cause returns its full weight. A session ruined by this cause that
also carries a degrading cause returns half, because removing the first demotes the session rather
than clearing it. A session ruined by two causes returns nothing, because it stays ruined either
way.

Gain is the ranking key. It is the only number that answers "what do I get for fixing this". It is
also conservative by design. The individual gains sum to less than the total deficit, and the
remainder is the overlap.

### The top-k preview

Because gains do not add, the page computes the union directly for whatever set a user selects.

```
gain(K) = sum over sessions of [ weight(s) - weight(s without any cause in K) ] / sum of weight(s)
```

That is what powers "fixing the top three takes you from 72 to 84". It is exact, not a projection.

### One query per dimension

None of this needs per-session storage. Each dimension emits a bitmask of which causes hit each
session, and the query groups by the bitmask.

```sql
SELECT cause_mask, severity, count() AS sessions
FROM ( ... per-session cause resolution ... )
GROUP BY cause_mask, severity
```

A dimension has at most eleven session causes, so the result is bounded regardless of project size.
Share, gain and any top-k union all derive from that table in application code. The table is small
enough to store on the snapshot, which is what lets a frozen snapshot from four days ago render its
own breakdown.

Ratio and baseline metrics are single causes with their own loss, so they need no mask.

## Below the floor

Hiding the number does not mean hiding the page. Every cause on it is a count, and counts are honest
at any sample size. Ten sessions with two thrashing loops and a truncated response is worth reading,
and it is exactly what a user testing before launch wants.

So below the floor Latitude renders the full cause list and the recommendations. It withholds only
the score and the dimension scores. The page reads "collecting, 40 of 200 sessions" above a list of
what it already found. The list ranks by affected sessions instead of by gain, because gain needs a
deficit to exist and counts do not.

This is what makes a high floor acceptable. Someone testing an agent before launch gets the diagnosis
rather than a number with an interval of 13 points, which is the more useful of the two.

---

# Part two: the five dimensions

Each section gives the question the dimension answers, its metrics, the signals it receives, its
denominator, and where a user goes to act. [`metrics.md`](metrics.md) defines every metric.

## Outcome

**Did the agent do what it was asked to do?**

This is the only dimension that measures what the agent achieved rather than how it behaved, so it
carries the largest weight.

Latitude cannot judge correctness, but it can read the user's own reaction. Conversation
intelligence runs on every session that ends, with no sampling. Several of the moments it labels are
the user saying the agent failed. That is stronger evidence than any judge, because the ground truth
is the next turn rather than a model's opinion.

| Metric | What it catches |
| --- | --- |
| [`moments.strong_failure`](metrics.md#momentsstrong_failure) | The user corrected the agent, gave up, or got frustrated |
| [`moments.failed_self_service`](metrics.md#momentsfailed_self_service) | The user was handed to a human after the agent had already gone wrong |
| [`moments.weak_failure`](metrics.md#momentsweak_failure) | The agent stalled or hesitated |
| [`spans.finish_ruined`](metrics.md#spansfinish_ruined) | The answer stopped mid-sentence, so the user received something broken |
| [`sessions.no_output`](metrics.md#sessionsno_output) | The agent produced nothing at all |
| [`signals.hit`](metrics.md#signalshit) | Signals assigned to Outcome, plus any signal with no dimension |

Outcome is the fallback. A signal that no rule and no model assigned to a dimension lands here and
is marked unclassified on the page. Outcome is the residual category by nature, and a real defect
that escapes the score silently is worse than one in a slightly wide bucket.

**Denominator**: sessions that conversation intelligence analyzed. The analysis status column is an
exact test at no cost. A session that is not a conversation records that the analyzer found no user
and assistant message pair. A batch workflow or a coding agent therefore falls out of this
dimension, which is the correct result.

Outcome is also measured only when analyzed sessions are at least a quarter of the eligible base. A
dimension that describes a fifth of the traffic must not be weighted as if it described all of it.

**Where the user goes**: Behaviors, which shows which topics carry the failures, and Signals.

## Reliability

**Can the agent succeed every time?**

Even an agent that does the right thing can fail to finish. This dimension covers runs that broke,
providers that refused, and tools that failed and were never recovered from.

| Metric | What it catches |
| --- | --- |
| [`sessions.no_output`](metrics.md#sessionsno_output) | The last assistant turn was empty or degenerate |
| [`spans.finish_ruined`](metrics.md#spansfinish_ruined) | The run ended on a truncation, a content filter or a malformed call |
| [`spans.finish_degraded`](metrics.md#spansfinish_degraded) | The same happened mid-run and the agent continued |
| [`spans.provider_error`](metrics.md#spansprovider_error) | The provider rejected a call |
| [`tools.call_failed`](metrics.md#toolscall_failed) | A tool failed and no later call succeeded |
| [`tools.structural_defect`](metrics.md#toolsstructural_defect) | The agent emitted a malformed call, a duplicate id, or an unknown id |
| [`signals.hit`](metrics.md#signalshit) | Signals assigned to Reliability |

Every metric here reads a payload or a finish reason. None reads a span status count. A generic
"a span errored" figure depends on how the customer's framework reports handled exceptions, so it
is not comparable between projects. This makes Reliability more comparable, not less.

One gap follows from that choice. An application failure that produced output, ended on a clean
finish reason, and involved no provider or tool error is invisible to the score. This is a
deliberate trade for comparability.

**Denominator**: all eligible sessions. Truncation is the most valuable metric here, because a
response cut off mid-sentence sets no error status. The user sees a broken answer and the telemetry
looks clean.

**Where the user goes**: Sessions for the failing runs, Tools for the failing tool.

## Cost

**Does the agent waste money?**

Not whether the agent is cheap. A long research task legitimately costs a hundred times a short
lookup. This dimension measures money spent on work that produced nothing, which is waste at any
scale.

| Metric | What it catches |
| --- | --- |
| [`cost.cache_gap`](metrics.md#costcache_gap) | Caching is leaving money on the table that this traffic could have saved |
| [`tools.dead_surface`](metrics.md#toolsdead_surface) | Tool definitions re-sent on every request and never called |
| [`tools.repeated_call`](metrics.md#toolsrepeated_call) | The same call ran again and returned the same answer |
| [`tools.thrashing`](metrics.md#toolsthrashing) | The same call ran three times running with the same answer |
| [`memory.noop_rewrite`](metrics.md#memorynoop_rewrite) | A write that changed nothing |
| [`memory.reverted_write`](metrics.md#memoryreverted_write) | A write that was undone |
| [`memory.repeated_zero_hit`](metrics.md#memoryrepeated_zero_hit) | The same search ran again and found nothing again |
| [`signals.hit`](metrics.md#signalshit) | Signals assigned to Cost |

`cost.cache_gap` and `tools.dead_surface` are ratio metrics. The other five are session metrics and
union together.

Cost per session, total spend and their trends are shown on the page and never scored. Rule 2
excludes them, and the Cost dashboard already owns them.

**Denominator**: the session metrics use sessions with at least one tool call or one memory event.
The ratio metrics use their own bases, named in [`metrics.md`](metrics.md).

**Where the user goes**: Cost, where the cache panel already models the recoverable spend, and Tools
for the dead definitions.

## Speed

**Does the agent waste time?**

Not whether the agent is fast. A background job may run for an hour and that is correct. This
dimension measures whether the agent reaches its goal by the shortest route it could have taken.
Thrashing, repeated calls and malformed calls all cost time no matter what the task is.

| Metric | What it catches |
| --- | --- |
| [`spans.ttft`](metrics.md#spansttft) | The model takes longer to start answering than the same model does elsewhere |
| [`spans.throughput`](metrics.md#spansthroughput) | The model generates slower than the same model does elsewhere |
| [`tools.repeated_call`](metrics.md#toolsrepeated_call) | A round trip that returned a known answer |
| [`tools.thrashing`](metrics.md#toolsthrashing) | Three round trips that returned a known answer |
| [`tools.structural_defect`](metrics.md#toolsstructural_defect) | A round trip wasted on a call the provider could not accept |
| [`tools.call_failed`](metrics.md#toolscall_failed) | Time spent on a tool that never worked |
| [`spans.finish_degraded`](metrics.md#spansfinish_degraded) | A generation that had to be redone |
| [`spans.provider_error`](metrics.md#spansprovider_error) | A call that had to be retried |
| [`memory.repeated_zero_hit`](metrics.md#memoryrepeated_zero_hit) | A search repeated for an answer already known to be absent |
| [`moments.weak_failure`](metrics.md#momentsweak_failure) | The agent stalled while the user waited |
| [`signals.hit`](metrics.md#signalshit) | Signals assigned to Speed |

`spans.ttft` and `spans.throughput` are baseline metrics and stay unmeasured until the fleet
aggregation runs. The rest are session metrics and union together.

**Denominator**: all eligible sessions for the baseline metrics. The session metrics use sessions
with at least one tool call, one memory event, or one analyzed conversation, depending on the metric.

**Where the user goes**: Sessions for the slow runs, Tools for the wasteful calls.

## Safety

**Did the agent expose or produce something it should not have?**

Safety needs a distinction the other dimensions do not. Exposure is not failure. Receiving a
jailbreak attempt says nothing about the agent. Complying with one says everything. The flagger
registry already encodes the difference: `jailbreaking` and `nsfw` judge user-authored content,
while the assistant-side flaggers judge what the agent produced.

| Metric | What it catches |
| --- | --- |
| [`safety.confirmed_failure`](metrics.md#safetyconfirmed_failure) | The agent leaked personal data, or complied with an injection |
| [`signals.hit`](metrics.md#signalshit) | Signals assigned to Safety |

### Safety has a different shape

Every safety flagger samples, and screening decisions are not stored today, so there is no
denominator and no rate. Safety therefore starts at 100 and each confirmed failure lowers it.

The deduction is per **distinct confirmed failure type**, not per occurrence. A confirmed leak costs
the same whether it appeared twice or twenty times, because a sampled flagger cannot tell you the
true count and pretending otherwise makes the number a function of sampling luck. It also stops one
noisy flagger from dominating.

How much each type costs is a calibration decision.

### A confirmed failure also caps the composite

Safety contributes its 0.10 weight like every other dimension. On top of that, one or more confirmed
failures cap the composite at **80**.

The weight alone would not be enough. Two confirmed failure types costing Safety 40 points move the
composite by about 4, so a team that leaked customer data would watch 78 become 74. Averaging a data
leak away is the wrong behaviour, and no weight small enough to be fair to the other four dimensions
is large enough to prevent it.

Eighty is a strong statement without being absolute. An agent that is otherwise excellent still shows
a visible ceiling, and the rest of the page stays readable.

A harder cap, at 60 for instance, would put an otherwise strong agent firmly in the bad half on one
finding. Safety findings come from a flagger that examines a fraction of traffic, so a single detection
carries real uncertainty about scale, and a cap that severe would overstate what is known. A softer
cap, at 90, is too small to change anyone's priorities, which is the only reason the cap exists.

```
score = min( weighted mean of the measured dimensions , cap )
```

### Safety's number is a floor

The score reads "at least this much confirmed harm was found", not "this share of traffic is safe".
The page must say so. It shows the confirmed count against the population that was actually
examined, for example "2 confirmed in 412 examined sessions", plus the exposure counts as context.

Storing screening decisions would give Safety a real denominator and turn it into a rate like the
other four. [`flaggers.md`](flaggers.md) covers that change.

### Exposure does not deduct on its own

An injection attempt arriving is not the agent's fault. It deducts only when paired with the agent's
response. Personal data arriving and the agent echoing it back is a leak. An injection arriving and
the agent complying is a failure. An injection arriving and the agent refusing is correct behaviour.

Separating compliance from exposure needs flagger work, because `jailbreaking` reports both in one
verdict today.

**Where the user goes**: Signals for the confirmed failures, Settings for the flagger configuration.
