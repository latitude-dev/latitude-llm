# Agent Score

> **Status**: design and staged implementation; progress is tracked in [`plan.md`](plan.md).
>
> **Durable homes after this stabilizes**: `dev-docs/signals.md` for signal evidence,
> `dev-docs/flaggers.md` for observation coverage, `dev-docs/conversation-intelligence.md` for
> moments as outcome evidence, `dev-docs/spans.md` for span readings, and a new
> `dev-docs/agent-benchmark.md` for the score itself.

## The problem

Latitude can explain one session, trace, metric, or signal. It does not give a project-level answer
to "how is this agent doing?"

The Signals page shows recurring defects without their effect on task success. Sessions show cost
and latency without distinguishing necessary work from waste. Tools, Memory, and Behaviors each show
one part of the system. A team can ship a change and still have to combine all of those pages by
hand to decide whether the agent improved.

## What we are building

The Agent Score is a number from 0 to 100 computed from a rolling selection of production sessions.
It is a weighted mean of five dimensions. The same dimensions apply to every project, but each one
has its own arithmetic because each measures a different property.

The same evidence powers a session assessment. A session does not receive five miniature scores. It
gets a chronological account of what went well, what went wrong, what the agent recovered from,
which resources appear inefficient or recoverable, and which evidence could not be measured.
Latitude must be able to explain one session before it summarizes a project.

Metrics and signals do not receive independent point budgets. They provide evidence about a
dimension's underlying quantity. Outcome, Reliability, Speed, and Safety each retain one native
estimand. Cost is the deliberate exception: it combines a fixed set of cost-efficiency families,
each evaluated in its own native denominator, into one 0 through 100 health score. The cause list
attributes the result after it has been computed.

Latitude publishes numeric values only when all five dimensions have enough traffic, coverage, and
confidence. If one dimension is not ready, neither the composite nor any dimension score is shown.
The page still lists the metrics and signal occurrences observed so far under their dimensions.

## The five dimensions

| Dimension | Question | Meaning of 80 |
| --- | --- | --- |
| Outcome | Did the agent do what it was asked to do? | About 80% of comparable sessions are expected to succeed |
| Reliability | Can the agent keep succeeding without an operational failure? | An 80% chance that the reference run completes without a terminal operational failure |
| Cost | How efficiently did the agent use paid and token-bearing resources? | The versioned mix of spend, context, tool, memory, and recovery efficiency is 80% healthy |
| Speed | How much user-visible time did the agent avoid wasting? | About 80% of observed critical-path time was necessary |
| Safety | How likely is the agent to avoid confirmed harmful output? | An 80% chance that the safety reference run contains no confirmed failure |

Outcome measures task success. Reliability measures operational completion. An agent can complete
the wrong task reliably, or accomplish the task despite unreliable infrastructure, so the two must
remain separate.

Cost and Speed measure efficiency rather than raw spend or latency. Cost is broader than money: it
also captures context misuse, inefficient tool and memory behavior, and recovery overhead even when
their exact dollar effect cannot be isolated. Speed remains the share of user-visible critical-path
time that was necessary. A ten-minute coding session can score better than a ten-second chatbot
session if the coding session needed its ten minutes and the chatbot spent half its time retrying
avoidable work.

Safety measures agent-caused harm. Receiving personal data, an injection attempt, or unsafe user
content is exposure, not failure. Exposure appears on the page but does not lower the score unless
the agent produced or disclosed something it should not have.

## How evidence reaches a dimension

Every scored observation belongs to one of four forms:

| Form | What it contributes | Examples |
| --- | --- | --- |
| Outcome evidence | A probability that the session accomplished its goal | Task Success verdicts, corrections, abandonment, no output, Outcome signals |
| Terminal failure evidence | Whether the session ended in an operational failure | unrecovered provider or tool errors, broken final output |
| Resource evidence | Spend, context tokens, operations, session burden, or critical-path time | cache gap, redundant context, retries, repeated calls, slow generation |
| Safety evidence | Whether the agent caused confirmed harm | PII disclosure, injection compliance |

Value observations enter in their natural unit. Cost families use money, input tokens, tool calls,
memory operations, and eligible sessions. Speed uses critical-path time, and calibrated evaluations
use probabilities. Event observations establish an endpoint, update a probability, or identify
inefficient resource use. Both forms meet at the session before the dimension aggregates the window.

Signals use the same path. A signal carries a scoring role for each dimension it informs. Its impact
comes from observed prevalence and consequence, not from the number of signals or a fixed allocation
of points. Correlated signals are evaluated together.

## The scoring rules

### 1. Define the quantity before the formula

Every dimension has a user-facing interpretation independent of its current metric catalog. Adding
a detector can improve the estimate, but it cannot change what the dimension means. Cost defines
five stable evidence families so new metrics can improve coverage without silently redefining its
balance.

### 2. No metric or signal owns points

A metric does not have an independent weight, budget, or severity. Its influence comes from the
measured outcome, failure probability, family-native Cost penalty, time, or safety risk it reveals.
Cost family weights are fixed in a versioned scoring artifact. Adding a new metric or signal cannot
force unrelated evidence to become less important.

### 3. Aggregate at session level before aggregating the window

Evidence that overlaps on one session is resolved once on that session. Cost evidence is deduplicated
within its family and capped by the family's eligible units. Time is capped by the critical path the
session actually consumed. Outcome uses one Task Success verdict per session, and Safety uses one
confirmed-harm union. Duplicate detectors and split signal clusters cannot multiply the underlying
result.

### 4. Normalize only after measuring the native quantity

Raw cost and duration never enter the composite directly. Cost normalizes each evidence family
before combining the fixed family weights. Speed divides avoidable critical-path time by observed
critical-path time. Reliability and Safety use a fixed reference-run horizon. Outcome is already a
probability. Every dimension therefore reaches 0 through 100 with a stated meaning.

### 5. Constants must carry semantics

The reference-run horizons and fleet control points are part of the score definition. They are not
used to distribute influence between metrics. A changed constant requires a scoring-version bump
and a marked discontinuity on the trend chart.

### 6. No comparison against the project's own past

The score depends on the selected window and frozen reference data. Its own history shows whether
the project improved. A moving project baseline would forgive slow regressions and make identical
projects score differently because one had more history.

### 7. Observation coverage is not success

A metric or dimension without enough readable evidence is unmeasured. Disabled flaggers, missing
telemetry, and biased samples lower coverage or widen the interval. None can raise the score.

### 8. Workflow state does not describe behavior

Priority, assignment, resolution, muting, and archiving affect triage. Creating a user signal does
not add scoring evidence. Ignored is the explicit first-version exception: scores assigned to an
ignored signal are excluded from future calculations. Existing daily snapshots are unchanged.

## Terms

| Term | Meaning |
| --- | --- |
| score | the weighted composite from 0 to 100 |
| dimension | Outcome, Reliability, Cost, Speed, or Safety |
| estimand | the real-world quantity a dimension estimates |
| metric | a named telemetry reading such as `tools.thrashing` |
| observation | a normalized fact resolved from telemetry or a persisted judgment; it is not necessarily a database row |
| signal | a recurring cluster of related findings |
| evidence role | how a metric or signal informs one dimension |
| session assessment | the dimension-aware evidence story for one session, without per-session scores |
| eligible session | a production session in the score's base population |
| readable session | a session for which a reader could have produced a verdict or value |
| reference run | a fixed number of future sessions used to express cumulative risk |
| counterfactual | the estimated resource use or outcome without an identified defect |
| attribution | the explanation of a computed score across causes |
| window | the period covered by a snapshot |
| snapshot | the immutable daily score record |
| scoring version | the version of formulas, models, and frozen reference data |
| Cost family | one stable component of Cost: spend, context, tools, memory, or recovery |
| source atom | the smallest resource fact that can be claimed once during Cost or Speed deduplication |

The existing session **Scores** surface contains evaluation, annotation, and custom score records.
**Agent Score** refers only to the project benchmark. Shared contracts use `scoreDimension` so they
do not collide with the analytics dimensions already used by Signals.

## The documents

Read them in this order:

| Document | Contents |
| --- | --- |
| [`session-assessment.md`](session-assessment.md) | One-session evidence model, story, coverage, UI, and public operation |
| [`score.md`](score.md) | Session selection, dimension estimands, formulas, confidence, attribution, and storage |
| [`metrics.md`](metrics.md) | Every metric, its evidence role, reader, counterfactual, and telemetry guard |
| [`signals.md`](signals.md) | Signal scoring roles, dynamic impact estimation, sampling, and invariants |
| [`flaggers.md`](flaggers.md) | Finding structure, recovery, safety confirmation, and screening coverage |
| [`page.md`](page.md) | Score meanings, cause ranking, uncertainty, and destinations |
| [`plan.md`](plan.md) | Implementation phases, dependencies, and exit gates |

## Required changes outside the score package

| Change | Reason |
| --- | --- |
| Signals carry per-dimension evidence roles | Dimension membership alone cannot say how a signal affects an estimand |
| A shared session-assessment resolver serves single-session and bulk reads | Sessions and the benchmark interpret evidence consistently |
| Flagger screening decisions and selection probabilities are stored | Sampled findings need a real or corrected denominator |
| Deterministic findings are recalculated from retained telemetry | Session assessment and bulk scoring see every fact without turning observations into score rows |
| Discovery scores can link to their deterministic source finding | Scores and signals join the session story without duplicating the full finding |
| Recovered findings remain observable without opening signals automatically | Dynamic readers expose retry waste without flooding signal discovery |
| Provider errors and finish reasons receive shared classifiers | Raw provider strings cannot define terminal failure consistently |
| Cost readers expose family-native eligible and penalized units | Cost must combine money and non-money evidence without pretending every effect is priced |
| Content readers expose bounded generation inputs and tool definitions | Context and downstream tool or memory footprint cannot be inferred from the latest conversation window |
| Duration readers expose trace structure and foreground classification | Speed waste must be capped and deduplicated before window aggregation |
| A sampled Task Success flagger persists passed and failed scores | Outcome needs a direct holistic reference verdict, not a union of defect counts |

## Fixed score settings

| Setting | Value |
| --- | --- |
| Window steps | 7, 14, 21, or 28 days, choosing the shortest step that reaches the target |
| Session target | 1,000 eligible sessions |
| Session floor | 200 eligible sessions |
| Reliability reference run | 20 sessions |
| Safety reference run | 1,000 sessions |
| Composite weights | Outcome 0.35, Reliability 0.25, Cost 0.15, Speed 0.15, Safety 0.10 |
| Cost families | spend, context, tools, memory, recovery |
| Fleet latency reference | frozen provider, model, input-size, and streaming cohorts |
| Publication gate | all five dimensions pass their traffic, coverage, and confidence floors |

The horizons express product expectations. Reliability asks whether the next 20 sessions can all
complete. Safety asks whether confirmed harm remains absent over 1,000 sessions. They do not allocate
influence among causes.

## Required launch artifacts

The structure is fixed. Launch requires these versioned artifacts and acceptance reports:

1. The Task Success prompt, supported judge configuration, result schema, sampling policy, and
   Outcome coverage floors.
2. The initial Cost scoring artifact: family weights, metric curves, applicability rules, caps,
   overlap groups, coverage floors, and residual-signal cap. Production recalibration follows the
   initial Agent Score launch.
3. Frozen TTFT and throughput reference distributions for every supported cohort.
4. The matching features and overlap diagnostics used by signal-level Cost and Speed estimators.
5. Reader-specific coverage and confidence floors with deterministic acceptance fixtures.
6. The complete Safety detector suite, its sampling contract, and confirmed-harm fixtures.
7. Hosted and self-hosted loading of the same formulas, prompts, reference bundles, and scoring
   artifacts. A substituted judge model creates a distinct local scoring version.
