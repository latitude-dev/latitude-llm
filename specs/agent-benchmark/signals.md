# Signals

> Read [`README.md`](README.md) for the five dimensions, and the
> [`signals.hit`](metrics.md#signalshit) entry in [`metrics.md`](metrics.md) for how a signal reaches
> the score.

A signal is Latitude's existing unit for a recurring defect. It already has a name, a description,
example sessions, a cost impact, a trend and a lifecycle. It is where a user goes to understand and
fix a problem.

The score needs one thing a signal does not have today: it must know which dimensions it lowers.

## What changes

| Change | Where |
| --- | --- |
| A signal carries a list of dimensions | the signal row, the entity schema, the public API shape |
| Most signals get their list from a static table, with no model call | the promotion path |
| The rest get it from the model call that already writes the name and description | `generate-signal-details.ts` |
| The list is written once and never regenerated | the promotion path |
| Existing promoted signals are backfilled | a one-off pass |
| Signal metrics are scoped to promoted signals | `variant-metrics-repository.ts` |

Nothing about the signal lifecycle changes. Priority, assignee, resolve, ignore, mute and feedback
all behave exactly as they do now.

## The dimension list

A signal carries zero or more of the five dimensions: `outcome`, `reliability`, `cost`, `speed` and
`safety`.

The list decides which dimension scores a session drops when that signal hits it. A signal in two
dimensions lowers both, which makes it cost roughly twice as much as a signal in one. That is
intended, and [`score.md`](score.md) explains why.

An empty list routes to Outcome. Outcome is the residual dimension by nature, and a real defect that
escapes the score silently is worse than one in a slightly wide bucket. The page marks such a signal
as unclassified, so nobody mistakes the fallback for a judgement.

The list is capped at two dimensions. Without a cap, list length becomes a severity multiplier, and
part of the list can come from a model. A model that assigns four dimensions to a plausible-sounding
signal would make it the most expensive item in the score, ahead of a genuinely severe signal
assigned one. The cap keeps the decision about severity out of the categorisation step.

## Assignment happens at promotion, and only once

The list is written when the signal is promoted, and it is never rewritten.

This matters because signal details are regenerated on a schedule. `refreshSignalDetailsUseCase`
reruns generation every eight hours on every promoted signal, so name and description improve as the
cluster grows. A dimension list that could change the same way would move points between dimensions
with no change to the agent, and the score would move for a reason nobody could explain.

The write-once pattern already exists on this row. `slug`, `origin` and `promotedAt` are all latched
the same way.

If a signal's members drift far enough that its dimensions are wrong, that is a clustering problem
rather than a classification problem, and the fix belongs in consolidation.

## Most signals need no model call

Every flagger-authored score carries the flagger's slug in its metadata, and
`ScoreRepository.listFlaggerSlugsBySignalId` already samples a signal's recent occurrences to find
which flaggers produced them. When one slug dominates, the dimension list comes from a static table.

| Flagger | Dimensions |
| --- | --- |
| `tool-call-errors` | reliability, speed |
| `output-schema-validation` | reliability, outcome |
| `empty-response` | reliability, outcome |
| `trashing` | cost, speed |
| `low-cache-hit-rate` | cost |
| `forgetting` | outcome, cost |
| `bluffing` | outcome |
| `incompletion` | outcome |
| `laziness` | outcome |
| `refusal` | outcome |
| `frustration` | outcome |
| `pii-leakage` | safety |
| `jailbreaking` | safety |
| `nsfw` | safety |

Two entries deserve a note.

`forgetting` sits in Outcome and Cost. The user experiences it as having to repeat themselves, which
is an outcome failure, and the repeated context costs tokens. Whether it also belongs in Speed is
arguable and it is left out to respect the cap.

`refusal` sits in Outcome rather than Safety. The flagger detects an **incorrect** refusal, meaning
the assistant declined something it should have handled. A correct refusal is correct behaviour.

`jailbreaking` and `nsfw` are marked as exposure. Their signals carry the Safety dimension so they
appear on the Safety panel, but exposure alone does not deduct. The Safety section of
[`score.md`](score.md) covers the distinction.

## The model handles the rest

A signal with no dominant slug reaches the model. So does a signal whose origin is a human
annotation, because there is no flagger slug to look up.

The dimension list joins the schema in `generate-signal-details.ts`, which already produces the name
and the description in one call. No extra request is needed. The prompt gives the model the five
dimensions, the cap of two, and the clustered feedback it already receives.

## Backfilling existing signals

The static table gives most of the backfill for free. Every flagger-derived signal classifies with
zero model calls, so only the annotation-origin tail needs a pass.

The backfill writes the list once, the same as promotion does. A signal that already has a list is
skipped.

## Which signals count

The score reads sessions carrying a score attached to a signal that satisfies two conditions.

**Promoted.** `promotedAt` is not null. Promotion is the evidence gate. The threshold scales with
volume: it asks for a share of the window's sessions, with a floor of 2 and a ceiling of 15 distinct
sessions over 30 days.

**Auto-discovered.** `origin` is `system`. This matters more than it looks. A user-created signal is
born promoted, so it skips the evidence gate entirely. Counting user signals would let a customer
change their own score by creating one, which breaks both the same-formula-for-everyone requirement
and the rule that no human action moves the score.

The volume-scaled threshold has a useful side effect. A large project promotes signals for defects
touching a tiny share of traffic, so it accumulates more signals than a small one. Under a count that
would make every large customer look worse. Under share of traffic affected, a signal touching 15
sessions out of three million weighs almost nothing and sorts to the bottom of the cause list on its
own.

## Signal metrics are scoped to promoted signals

`variant-metrics-repository.ts` currently scopes signal metrics with `signal_id != ''`, which includes
candidates that were never promoted. Promotion state lives in Postgres, so the ClickHouse column
cannot express it.

Every read must pass the eligible signal id set explicitly. `listSignalWindowMetrics` already accepts
a `signalIds` argument. `SignalRepository.list` already denies unpromoted signals by default.

This is a bug today, not only a requirement of the score. `signals.affected_sessions_rate` overcounts
in experiments for the same reason.

## What the score must not read

**Signal counts.** The number of signals, the number of distinct signals and the total occurrence
count all rise when Latitude ships a better flagger and when traffic gets more varied. Neither is the
agent getting worse.

**Lifecycle state.** Priority, assignee, resolved, unresolved, regressed, muted and archived are
organizational state. A user who triages must not score worse than a user who ignores.

The score gets this for free rather than by policy. `signals.hit` reads presence in the window, so a
signal that fired in none of the window's sessions contributes nothing whatever its state says, and a
signal that fired contributes the same whatever its state says.

**Escalation.** A signal escalating is the one state Latitude derives rather than a user setting, so
it would be legitimate under the rules. A session set has no natural place for a multiplier, so
escalation ranks the cause list instead of changing the score. Escalation is also already what the
incident system notifies on.

## One property the page must respect

The rate this metric measures is not the true defect rate, and it must never be published as one.

Flagger screening does not sample uniformly. A hint bypasses sampling entirely, so a session that
already looks like trouble is examined at close to full rate. A session with no hint is sampled at the
default rate, and a session carrying positive hints is deprioritized further. Hints include span
errors, tool errors, tool loops, frustration and refusal patterns, and outliers on duration, time to
first token, tokens and cost.

The measured rate therefore rises faster than the true rate. A project full of errors and loops has
nearly all of those sessions examined. A clean project has a tenth of its sessions examined.

For a scored metric this is acceptable. It is monotone in the true rate, and every project runs
identical machinery, so two projects are compared on the same curve.

As a published figure it is wrong. The page must show the point contribution and the affected session
count, both of which are exactly true, and never a sentence of the form "12% of your sessions have
issues".

Storing screening decisions would remove this caveat by giving the metric a real denominator.
[`flaggers.md`](flaggers.md) covers that change.
