# Metrics

> Read [`README.md`](README.md) for the five rules and [`score.md`](score.md) for how a metric's
> loss becomes a dimension score.

This is the catalogue. Every metric that may enter the score is listed with its ID, its shape, the
dimensions it belongs to, how it is read, and what stops it firing on missing telemetry. The last
section lists what stays out and why.

## Contents

- [How a metric qualifies](#how-a-metric-qualifies)
- [Guards against missing telemetry](#guards-against-missing-telemetry)
- [Fleet baselines](#fleet-baselines)
- [Sessions](#sessions)
- [Spans](#spans)
- [Tools](#tools)
- [Memory](#memory)
- [Cost](#cost)
- [Moments](#moments)
- [Signals](#signals)
- [Safety](#safety)
- [What we do not measure](#what-we-do-not-measure)

## How a metric qualifies

Rule 4 forbids a tunable constant. Many useful measurements have a healthy non-zero value, so a
plain threshold would penalize an agent that has nothing left to improve. Four forms remove the
constant. A metric enters the score through one of them, or it stays out.

**Repetition without progress.** The identical action, with the identical result, more than once. No
agent of any kind benefits from doing the same fruitless thing twice. This form covers
`tools.repeated_call`, `tools.thrashing`, `memory.repeated_zero_hit`, `memory.noop_rewrite` and
`memory.reverted_write`.

**Paired evidence.** A sequence where each half is normal and the combination is not. A handoff to a
human is correct for many products. A handoff after the agent already had to be corrected is a
failure of self-service. This form covers `moments.failed_self_service`.

**A measured ceiling.** Compute what this project could achieve given its own constraints, and read
the gap. If achievable equals actual, the loss is 0. This form covers `cost.cache_gap` and
`tools.dead_surface`.

**A fleet baseline.** Compare against percentiles measured across every project running the same
provider and model. The line is measured rather than chosen. This form covers `spans.ttft` and
`spans.throughput`.

A fifth form exists and is deferred. Comparing a metric inside one behavior cluster holds the
workload constant, which would admit dispersion. Percentile spread across a whole project measures
workload variety as much as instability, because a support agent legitimately handles both "what are
your hours" and "debug my integration". Inside one cluster the work is roughly uniform, so spread
means instability. This needs the cluster assignment to be reliable, so it is not in the first
version.

## Guards against missing telemetry

A metric must fire on what the agent did, not on what the customer failed to instrument. Two shapes
of mistake produce that failure, and both have been found in candidate metrics.

**Absence read as evidence.** A field is missing and the metric treats the absence as misbehaviour.
Missing instrumentation is then indistinguishable from the defect. One candidate metric was cut for
this: a tool called but never declared usually means the definitions were not captured, not that the
agent invented a tool name. The flagger code already guards the same case, with the comment
"Successful execution proves availability; incomplete definedTools must not flag it".

**Collision on empty fields.** A metric groups or hashes on a field that can be empty. When the
field is empty every row collides, so the pattern appears in every session. Three metrics needed a
guard for this, all of them named below.

Every metric in the catalogue states its guard. A metric with no guard needs none.

## Fleet baselines

Some measurements have an unambiguous direction and no universal scale. Time to first token is the
clearest case. Lower is always better, but 200 milliseconds, 2 seconds and 20 seconds are all
correct for some agent somewhere.

Latitude has the data to set the line without guessing. It holds spans from every project, so it can
measure what time to first token actually looks like for the same provider and the same model.

### Cohort keys

Time to first token is mostly explained by four things Latitude records. The baseline groups on all
four.

| Key | Why it matters |
| --- | --- |
| Provider | the same model served through Bedrock and through Anthropic behaves differently |
| Model | a reasoning model and a small chat model are not comparable |
| Input token bucket | a 200,000 token prompt starts slower than a 500 token prompt on the same model. Buckets step by powers of four: under 1k, 1k to 4k, 4k to 16k, 16k to 64k, over 64k |
| Streaming | for a non-streaming call, time to first token collapses into total duration |

Without the model key, a project running a reasoning model would lose points for a model choice
rather than for anything it did. That is the failure the baseline exists to prevent.

### The two control points

A job computes the distribution per cohort and extracts two points.

| Point | Value | Meaning |
| --- | --- | --- |
| good | the fleet median | being typical for your model is fine, and scores full marks |
| poor | the fleet 95th percentile | being in the slowest 5% costs the whole metric |

A project's value maps between them.

The good point has to sit at the median, because a score is not a ranking. Putting it at the 25th
percentile would leave three quarters of all projects below full marks by construction, so the median
project would lose roughly a fifth of the metric and an average agent could never score well on Speed
no matter what it did. The control points encode acceptable against bad, not top quartile against
bottom decile.

The poor point sits at the 95th percentile rather than the 90th for the same reason in the other
direction. Losing the whole metric should mean being genuinely unusual, not merely below average.

### Frozen, not live

The baseline is not queried at scoring time. The control points are frozen into the scoring version.
This matters for three reasons.

A live comparison would make the score depend on other projects' behaviour. A project could lose
points because someone else got faster, with no change to itself. Rule 3 forbids comparison against
the project's own past, and the same reasoning applies to the fleet's present.

A live comparison also makes the fleet average 50 by construction, so no absolute reading is
possible and general improvement moves nobody.

Frozen points work when self-hosted. The numbers ship in the code, so an instance with no fleet
scores identically. Latitude must stay cleanly self-hostable, so a metric that needs a network
lookup to a central service cannot be load-bearing.

When the fleet shifts materially, the points are recomputed, the scoring version is bumped, and the
trend chart marks the discontinuity.

### Gates and fallback

A rarely used model has too few samples for a stable percentile. The existing cohort code sets the
precedent at 30, 100 and 1000 samples for the 90th, 95th and 99th percentiles.

The fallback chain is provider and model and token bucket, then provider and model, then not
measured. It never falls back to a single line across all models, because that reintroduces the
model-choice penalty the cohort keys exist to remove.

### Reading across organizations

Computing the baseline reads spans from every organization, which is a boundary this codebase
guards. The job must therefore emit only the derived distribution: cohort keys, percentiles and a
sample count. No per-organization data leaves its scope and no tenant is identifiable in the output.

---

# Sessions

### sessions.no_output

Session metric. Outcome, Reliability.

The agent's last turn produced nothing a user could read. The `empty-response` flagger already
detects this, and it is the only reader for this metric.

The flagger finds the last assistant message and checks it. A message holding a tool call or a
reasoning part counts as production, so a turn that only calls a tool is not empty. Text that is
blank, whitespace only, or one character repeated counts as empty.

The flagger needs no guard, because it already has one. It returns no match when the conversation
holds no assistant message at all, which is exactly what happens when a framework never captured
assistant output. The metric therefore under-reports for such a project rather than reporting every
session as broken.

---

# Spans

### spans.finish_ruined

Session metric. Outcome, Reliability.

The session's last generation stopped for a reason other than the model finishing its answer or the
caller stopping it. Truncation is the common case: the answer stops mid-sentence, the user sees
something broken, and no error status is set anywhere.

A shared classifier sorts every finish reason into clean, unreliable or unmapped. Clean covers normal
stops, caller-forced stops and tool-call continuations. A stop sequence, a cancelled request or a
disconnected client is the caller setting a boundary, so the agent did what it was told. A tool-call
finish is the normal shape of an agent loop. A refusal is the model working correctly and declining
on purpose, so whether the refusal was right is an Outcome question the `refusal` flagger already
answers. Unreliable covers truncation, provider content filters, guardrail interventions and
malformed function calls. Unmapped covers anything else.

Unmapped reasons feed confidence rather than the score. A value the SDK could not map says something
about instrumentation quality and nothing about the agent.

Values arrive provider-native with only light normalization, so the classifier compares lowercased
strings. Gemini emits uppercase, Anthropic uses `end_turn` where OpenAI uses `stop`, and Cohere uses
`COMPLETE`. The classifier is one helper in `@domain/spans`, so the score, the field registry and the
page all read the same list.

The guard is that truncation needs two signals. A classifier with a deliberately tight output limit
hits `length` on nearly every call, and its output may be complete. So this metric marks a session
ruined only when the finish reason is unreliable **and** the output shows the damage, which the
`output-schema-validation` flagger detects as unclosed or malformed text. A content filter or a
malformed function call needs no second signal, because neither has a legitimate configured cause.

The finish reason list drifts. A new provider or a new value lands in unmapped, which is safe but
silent. A periodic report of the top unmapped values across the fleet keeps the list current without
anyone remembering to look.

### spans.finish_degraded

Session metric. Reliability, Speed.

The same condition on a generation that was not the session's last. The agent hit the problem and
kept going, so the session is degraded rather than ruined. It cost an extra generation, which is why
this sits in Speed as well.

Position decides which of the two metrics applies. Finish reasons sit on every chat span, and an
agent loop has many.

### spans.provider_error

Session metric. Reliability, Speed.

The provider rejected a call. Rate limiting, overload and service failure all qualify, read from the
span's error type on a chat span.

A retry that then succeeded still counts, at degraded rather than ruined. The run was unreliable
even though it finished, and the retry cost time. A rejection the session never recovered from
counts as ruined.

The guard is that this reads a named provider error class on a chat span. It does not read a span
status count. A generic count of errored spans depends on how the customer's framework reports
handled exceptions, and it mixes in tool failures that other metrics already measure.

### spans.ttft

Baseline metric. Speed.

How long the model takes to start answering, compared against the fleet baseline for the same
provider, model, prompt size and streaming mode.

Read the project's median time to first token per cohort, then map it between the cohort's good and
poor control points.

This metric is not measured until the fleet aggregation job has run and the control points are
frozen into the scoring version.

### spans.throughput

Baseline metric. Speed.

How fast the model produces tokens once it has started, compared against the same cohort.

The span table already computes `tokens_per_second` and `inter_token_latency_ns` as aliases, so no
new arithmetic is needed. The same cohort keys, gates and fallback chain apply.

Also not measured until the aggregation job has run.

---

# Tools

### tools.call_failed

Session metric. Reliability, Speed.

A tool call failed and no later call succeeded. The `tool-call-errors` flagger is the reader.

The flagger walks tool call and response pairs in the message payload. It marks an error recovered
when a later call succeeded, and then does not flag it. An agent that runs hundreds of tools hits
transient failures constantly and the user never sees them.

It also excludes HTTP statuses in a range the caller expects, so a tool that answers 404 for a
missing record is not a defect.

Reading the flagger rather than the span status is deliberate. A span status read has none of that
judgement, so it would flag every agent that retries.

### tools.structural_defect

Session metric. Reliability, Speed.

The agent emitted a tool call the provider could not accept. Three cases qualify: a call with a
missing or empty id or name, a duplicate call id, and a response referencing an id no call used.

All three live in the message payload, so a span status cannot see them. All three are bugs in how
the agent calls tools rather than transient failures, so none is ever marked recovered.

The guard is that the flagger's fourth finding kind, a call to a tool absent from the declared
toolset, is excluded from this metric. That case usually means the definitions were not captured
rather than that the agent invented a name. The flagger already partly guards it, and this metric
drops it entirely.

The unknown-id case carries its own guard in the flagger, which only flags when at least one tool
call survived in the window. Input truncation can strip the assistant turn that made a call and
leave an orphan response behind.

### tools.repeated_call

Session metric. Cost, Speed.

The same tool ran more than once in a session with the same arguments and returned the same result.
Group by session, tool name, a hash of the input, and a hash of the output.

Comparing the output is required, not optional. Polling repeats arguments by design: an agent
checking a job status five times is behaving correctly, and the point is that the answer changes. A
call is waste only when it returned something already known.

The guard is that calls with an empty input are excluded. If arguments were never captured, every
call to the same tool hashes alike and the metric would fire on every session that used one tool
twice.

### tools.thrashing

Session metric. Cost, Speed.

The same tool ran three times consecutively with the same arguments and the same result. The
deterministic half of the `trashing` flagger is the reader.

Three identical invocations is the canonical hard-loop signal used across agent frameworks. The
flagger currently compares tool name and arguments only, so it needs the output comparison and the
empty-argument guard described for `tools.repeated_call`. Both changes are in
[`flaggers.md`](flaggers.md).

Dominance shape, meaning one tool taking most of the calls in a session, is not this metric and not
any metric. A search agent legitimately calls search in most of its turns. That shape stays what it
is today: a hint that routes the session to the LLM half of the same flagger for verification, whose
verdict then reaches the score through a promoted signal.

### tools.dead_surface

Ratio metric. Cost.

Tool definitions re-sent on every request and never called. Every unused definition costs money on
every turn and makes tool selection harder.

```
loss = tools never called across the whole observation period / tools defined
```

The achievable value is the point of the observation period. A tool that went uncalled in one window
may simply not have been needed that week, so incidental dead surface is excluded. Only definitions
never called since they first appeared count.

The score uses the ratio. The page shows an estimated monthly cost derived from the definition
payload size, labelled as an estimate, because a ratio is defensible in a formula and a money figure
is what makes someone act.

The definition shape needs no guard. Ingestion normalizes all three tool conventions into one flat
form before the definitions reach storage, including the wrapped OpenAI shape, and it reads the
schema from `parameters`, `inputSchema` or `input_schema`.

One known false positive remains. A tool defined under one name and called under another, for
example with an MCP namespace prefix on one side only, looks permanently dead. The rate of called
names with no matching definition measures how often this happens, and it is reported as a confidence
input for this metric.

---

# Memory

All three memory metrics use the repetition form, so none inspects what is stored. They apply only
to sessions with memory activity.

### memory.repeated_zero_hit

Session metric. Cost, Speed.

The same search query ran more than once in a session and returned nothing every time.

A single search that finds nothing is healthy. An agent checking whether it already knows something,
and correctly finding that it does not, is doing the right thing. Only the repetition is a defect:
either the answer should have been recorded after the first search, or the second search should not
have happened.

Grouping is on the query text alone. Nothing compares the query against memory contents, which was
considered and rejected as too expensive.

The guard is that searches with empty query text are excluded. Redaction or missing instrumentation
would otherwise collapse every search into one group.

### memory.noop_rewrite

Session metric. Cost.

A write whose content matched what the record already held. Writing the same bytes again is waste at
any scale.

Read by comparing the write's content hash against the record's previous hash.

The guard is that writes with an empty content hash are excluded, for the same collision reason.

### memory.reverted_write

Session metric. Cost.

A write that was undone back to the record's prior content within the same session. The work that
produced it was wasted.

The same empty-hash guard applies.

---

# Cost

### cost.cache_gap

Ratio metric. Cost.

How much of the cache saving this traffic could have had, that it did not have.

```
loss = 1 - (measured hit rate / achievable hit rate)
```

The achievable rate is the highest hit rate this project's own request cadence could produce. It is
derived from how much cache-eligible volume arrived close enough behind another call to have found a
live entry, measured against each model's documented cache lifetime. The Cost dashboard already
computes both figures, along with the share of tokens for which a ceiling could be computed at all.

A project whose traffic is not cacheable has a low ceiling and a loss near zero. A model correctly
running without caching is classified as such and contributes nothing. No threshold is involved
anywhere, which is why this metric replaced the `low-cache-hit-rate` flagger as the reader for
caching.

The denominator is tokens belonging to models where a ceiling could be computed. That share is
reported as a confidence input, because a model with no measurable cadence would otherwise have to
count as either perfect or worthless, and both are inventions.

---

# Moments

Conversation intelligence runs on every session that ends, with no sampling. All three metrics use
analyzed sessions as their denominator.

### moments.strong_failure

Session metric. Outcome.

The user told Latitude that the agent failed. Any one of four moment kinds is enough: the user
corrected the agent, the agent re-asked for something already given, the user abandoned the session,
or the user expressed frustration.

This is stronger evidence than any judge, because the ground truth is the user's own next turn rather
than a model's opinion.

Moment confidence is persisted per label. The classifier already validated every label it stored, so
no second confidence floor applies. That may need revisiting if false positives appear.

### moments.failed_self_service

Session metric. Outcome.

The session was handed to a human after the agent had already gone wrong. Read as an escalation
moment preceded by a correction or a frustration moment, ordered by message index.

The pairing is what makes this fair. Many products are designed to hand off, and a handoff as the
intended path is not a failure. A handoff after the agent had to be corrected is one.

### moments.weak_failure

Session metric. Outcome, Speed.

The agent stalled or hesitated. The session is marked degraded rather than ruined, because the user
may still have got what they came for.

It sits in Speed as well because a stalled agent is one the user waited on.

---

# Signals

### signals.hit

Session metric. All five dimensions.

The session carried a score attached to a signal that was both promoted and auto-discovered. The
signal's own dimension list decides which dimensions the session affects, which is why this metric
appears in all five.

Both conditions matter. Promotion is the evidence gate. Auto-discovered origin matters because a
user-created signal is born promoted and skips that gate, so counting user signals would let a
customer move their own score by creating one.

Presence in the window is what counts, not existence. A project with a hundred old signals that fired
in none of the window's sessions loses nothing for having them. That also settles triage by
construction rather than by policy: resolving or ignoring a signal cannot change the score, because
this metric never reads a signal's state.

[`signals.md`](signals.md) covers how a signal gets its dimensions, and records one property of this
metric that the page must respect: hints bypass sampling, so the measured rate rises faster than the
true rate. That is acceptable for a scored metric and not acceptable as a published percentage.

---

# Safety

### safety.confirmed_failure

Penalty metric. Safety.

The agent produced or did something it should not have. Two cases qualify: the assistant revealed
personal data it should not have surfaced, and the assistant complied with a prompt injection.

This metric does not produce a loss between 0 and 1 like the others. It deducts from a starting
score of 100, once per distinct confirmed failure type rather than once per occurrence. The Safety
section of [`score.md`](score.md) explains why.

The second case cannot be read today. The `jailbreaking` flagger reports the attempt and the
compliance in one verdict, so a hit does not distinguish an attack received from an attack that
worked. Scoring it as it stands would penalize an agent for having hostile users. Separating the two
needs flagger work, described in [`flaggers.md`](flaggers.md).

Exposure is never scored on its own. Personal data arriving in a conversation, and injection attempts
being received, are shown as counts for context.

---

# What we do not measure

Everything below could be computed and is deliberately left out of the score. Most of it is shown on
the page, next to the number, with its trend and a link to the page that owns it.

## Absolute values

Cost per session and in total. Session duration at any percentile. Time to first token as a raw
figure. Token counts. Session, trace and span volume. User counts.

Rule 2 excludes all of them. A coding agent that runs for ten minutes and costs a dollar per session
is not worse than a chatbot that answers in two seconds for a fraction of a cent. Any threshold
separating them would be a statement about one use case.

Time to first token and generation speed do enter the score, but only through a fleet baseline that
controls for provider and model. The raw figure never does.

## Comparisons against the project's own past

Window-over-window drift on any metric. Behavior cluster trend classification. Signal escalation
scoring.

Rule 3 excludes them, and the reasons are worth keeping written down. A project cloned from another
starts with no baseline, so its drift metrics go unmeasured, its weights redistribute, and it scores
higher than the original for behaving identically. A defect that was fixed and came back costs more
the second time than the first, because a regression term fires on top of the defect. A project that
degrades slowly never triggers drift, because its baseline keeps catching up.

None of this machinery is wasted. Monitors watch metrics against their own baselines and open
incidents. The score's own daily history shows whether the agent improved, and it can only do that
because drift is not inside the score. If it were, a drop could mean the agent got worse or could
mean it was already bad and the baseline caught up, and nobody could tell which.

## Levels with a healthy value

Zero-hit search share. Dead memory token share. Cache hit rate read as a level rather than against
its ceiling. Calls per offer. Dominance shape, meaning one tool taking most of a session's calls.
Duplicate memory records.

Each has a non-zero value that a well-behaved agent produces, so scoring the level would cap that
agent below 100 with no action available. A search agent calls search in most of its turns. A
memory-using agent checks before writing. First turns cannot hit a cache.

Where a defect could be isolated inside one of these, it appears in the catalogue as its own metric
and the level stays out. Calls per offer has no such defect, because a high value means loops and a
low value means dead surface, so it stays purely diagnostic.

## Span error counts

The error count on a trace or a session.

Those spans can be failed tool calls, which `tools.call_failed` already measures with far more
judgement. They can also be spans that never affected the agent at all. Some auto-instrumentation
sets an error status on any caught exception, including one the framework handled cleanly, so the
figure is not comparable between projects.

The count keeps every other job it has. It still drives the session status field, the
`sessions.error_rate` experiment metric and the Errors monitor dimension. The score does not read it.

## A tool called but never declared

The agent called a tool absent from the captured definitions.

This usually means the definitions were not sent or not parsed, not that the agent invented a name.
The flagger code already reaches the same conclusion for the case where the call succeeded.

The measurement is still useful in one place. The rate of called names with no matching definition
tells you how much to trust the defined tool surface, so it is reported as a confidence input for
`tools.dead_surface`.

## Dispersion

Percentile ratios on duration, cost and tokens.

Scale-free and a genuine function of the window, so rules 2 and 3 are satisfied. Across a whole
project it measures workload variety as much as instability. It becomes admissible inside a behavior
cluster, and it waits for that.

## Counts that grow with detection or traffic

Signal count. Distinct signals. Total occurrences. Affected trace and user counts as scored figures.

A count rises when Latitude ships a better flagger and when a project's traffic gets more varied.
Neither is the agent getting worse. Share of traffic affected does not have this property, which is
why the catalogue uses it.

Better detection does still lower every project's score. That is handled rather than avoided by the
scoring version, which stamps every snapshot, marks the discontinuity on the trend chart, and comes
with a published note on what changed.

## Human actions and workflow state

Priority. Assignee. Resolved, unresolved and regressed. Muted and archived. Signal feedback.

Rule 5 and the invariance it protects. A user who triages must not score worse than a user who
ignores. These change what the page shows and how it sorts. They never change the arithmetic.

## Flagger configuration

Muted, archived and disabled flaggers.

Ignoring a signal archives its flagger, so occurrences stop by construction. That is Latitude
stopping looking, not the defect going away. Confidence drops and the score holds.

One uncomfortable corollary follows. Flaggers are switchable per project, so a customer can switch
off part of their own measurement. Rule 5 handles it correctly, and it is a reason to keep
`spans.finish_ruined` and `spans.provider_error` sourced from telemetry even where a flagger
overlaps, because those cannot be turned off.

## Sampled flagger output not routed through a signal

Raw occurrence counts from the flaggers that call a model: incompletion, laziness, bluffing,
forgetting, refusal and frustration.

These sample and store only positive findings, so a raw count is not a rate over anything. There is
no recorded denominator, because screening decisions are reduced to a log line and never stored. Such
a flagger enters the score only through a promoted signal, where the promotion threshold has already
demanded repeated evidence.

## Flaggers that judge user-authored content

Jailbreaking and NSFW, as they behave today.

Both classify what arrived rather than what the agent produced, and the registry records this as
`classifiesAssistantResponseOnly: false`. Scoring them would penalize an agent for having hostile
users. They appear as exposure counts, which is a different claim: how many attempts arrived, and
whether any were complied with.

## Correct refusals

The policy refusal moment, and the `refusal` finish reason.

A model declining a request it should decline worked correctly. Whether a refusal was wrong is a
separate question, and the `refusal` flagger already answers it.

## Human annotations

Annotation pass rate. Thumbs-down counts.

The strongest evidence available and the least usable as a rate, because its coverage is whatever a
person happened to review. A team that reviews more of its traffic would score worse. Annotations
feed confidence and the cause list, never a metric.

## Evaluation alignment

The confusion matrix and agreement figures on generated evaluations.

These measure how well a flagger or an evaluation matches a human reviewer. That is the detection
system's quality, not the agent's.

## Positive evidence

Resolution and user satisfaction moments.

Absence of a positive moment is not evidence of failure, so counting them as credit would penalize
sessions that went quietly. They raise the confidence figure instead, which is the honest use:
separating "we saw it go well" from "we saw nothing".

## Synthetic traffic

Sessions carrying a simulation id.

Simulations are test runs against curated cases. They belong to experiments and regression testing,
not to a production score.

## Recoverable zero-hit classification

Deciding whether a zero-hit memory search would have matched an existing record.

This would need an embedding comparison against live memory contents on every search. Ruled out on
cost. The repetition form in `memory.repeated_zero_hit` catches the unambiguous part of the same idea
without reading the store.
