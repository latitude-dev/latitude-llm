# Flaggers

> Read [`metrics.md`](metrics.md) first. Six metrics read a flagger, and this document covers what
> must change before those reads are correct.

A flagger finds one kind of failure in a session. The score does not add a scoring layer on top of
flaggers. It reads them, which means a flagger that fires on the wrong thing puts the wrong number on
the page.

Three fixes are correctness work that improves the product whether or not the score ships. Two
additions are new capability the score needs. One schema change unblocks the cause list.

## What changes

| Change | Kind | Blocks |
| --- | --- | --- |
| `trashing` compares tool output, not only tool name and arguments | fix | `tools.thrashing`, `tools.repeated_call` |
| Two memory reads guard against empty fields | fix | all three memory metrics |
| Truncation requires two signals | fix | `spans.finish_ruined` |
| A flagger separates a prompt injection that worked from one that was attempted | addition | `safety.confirmed_failure` |
| Screening decisions are stored | addition | Safety as a rate, and the honesty caveat on `signals.hit` |
| ClickHouse `scores` carries the flagger slug | schema | the cause list, not the score |

## Deterministic and LLM flaggers earn different trust

The registry marks each flagger as deterministic or LLM. The distinction decides how the score reads
its output.

A **deterministic** flagger is code. It runs on every session and it cannot hallucinate. Its scores
count directly, whether or not they clustered into a signal. These are `tool-call-errors`,
`output-schema-validation`, `empty-response`, `low-cache-hit-rate` and the deterministic half of
`trashing`.

An **LLM** flagger samples and stores only positive findings, so its raw occurrence count is not a
rate over anything. Its output reaches the score only through a promoted signal, where the promotion
threshold has already demanded repeated evidence.

`trashing` has both halves, and they are separable on the score row. The metadata carries a flagger
trace id only when the decision came from a captured model call. An absent trace id means the
deterministic half fired.

## Fix: thrashing must compare output

`trashing` builds a signature per tool call from the tool name and a preview of the arguments, then
counts the longest consecutive run of identical signatures. Three in a row is a match.

Two false positives follow from comparing arguments alone.

**Polling repeats arguments by design.** An agent checking a job status five times sends the same
arguments every time, and the point is that the answer changes. That is correct behaviour and it
currently reads as a hard loop.

**Absent arguments collide.** If the arguments were never captured, or redaction removed them, every
consecutive call to the same tool produces the same signature. A session that used one tool three
times reads as thrashing.

The fix is one change with two parts. Add a hash of the tool output to the signature, so a run counts
only when the calls returned the same result. And skip calls whose captured arguments are empty, so a
missing field cannot manufacture a run.

This is a flagger bug independent of the score. It affects the signals customers see today.

The same signature rule applies to the span-level read behind `tools.repeated_call`, which is a
separate reader of the same idea. Both need it.

## Fix: memory reads need non-empty guards

Two memory metrics group on a field that can be empty, which is the same collision.

`memory.noop_rewrite` compares a write's content hash against the record's previous hash. If the
content hash is empty, because the SDK did not populate it or content capture is off, every write
matches every other and every session reads as a no-op.

`memory.repeated_zero_hit` groups searches by query text. If the query text is empty, every search
collapses into one group and every session with two searches reads as a repeat.

Both need the same guard: skip rows whose grouping field is empty. The existing memory analytics reads
are store-scoped and grouped by record and trace, so a session-grained read is new work in any case,
and the guard goes in when that read is written.

## Fix: truncation requires two signals

A finish reason of `length` or `max_tokens` usually means the answer was cut off. It does not always.
A classifier with a deliberately tight output limit hits `length` on nearly every call, and its output
may be complete.

So `spans.finish_ruined` marks a session ruined on truncation only when the finish reason is
unreliable and the output shows the damage. The `output-schema-validation` flagger already detects
unclosed and malformed text, which is the second signal.

A content filter, a guardrail intervention or a malformed function call needs no second signal. None
of those has a legitimate configured cause.

## Addition: separate a successful injection from an attempted one

`safety.confirmed_failure` needs to know that an injection worked. Today it cannot.

The `jailbreaking` flagger covers both halves in one verdict. Its instructions ask for prompt
injection, instruction hierarchy attacks, policy evasion and tool abuse, and also for "assistant
behavior that actually follows those bypass attempts". The registry marks it
`classifiesAssistantResponseOnly: false`, so it classifies user-authored content as well.

A hit therefore cannot tell an attack received from an attack that worked. Scoring it as it stands
would penalize an agent for having hostile users, which is the exact mistake the exposure and failure
distinction exists to prevent.

Two ways to fix it. Split the verdict so one flagger reports the attempt and another reports the
compliance. Or extend the existing verdict with a compliance field, which keeps one model call.

The second is cheaper and it keeps the two halves consistent, because the same model sees the same
conversation. Either way, only the compliance half deducts, and the attempt half stays a count on the
Safety panel.

## Addition: store screening decisions

Screening decides, per session and per flagger, whether the flagger runs. The decision has a reason:
it matched deterministically, a hint fired, the sampler selected it, the sampler skipped it, or the
rate limiter dropped it.

Today `summarizeDecisions` reduces all of that to a log line. Nothing is stored.

Three things depend on storing it.

**Safety cannot be a rate.** With no record of what was examined, there is no denominator, so Safety
has to be a penalty model whose number is a floor rather than an estimate. Storing decisions turns
Safety into a rate like the other four dimensions.

**The `signals.hit` caveat.** Hints bypass sampling, so the measured rate rises faster than the true
rate and the page must never publish it as a percentage. Stored decisions make the actual examined
population known, so the rate becomes a real figure over a real denominator.

**Confidence.** The confidence panel wants the screened share per flagger. It cannot report what it
cannot count.

The shape is small: organization, project, session, flagger slug, decision, reason and a timestamp.
One append-only ClickHouse table, or a column set on an existing one. The value is not limited to the
score, because every sampled flagger becomes measurable for the first time.

## Schema: the flagger slug in ClickHouse

The ClickHouse `scores` table has nineteen columns and no metadata column. The flagger slug and the
flagger trace id live only in the Postgres `scores.metadata` field.

So in ClickHouse every flagger-authored score looks identical. You can tell that a flagger wrote a
score on a session. You cannot tell which flagger.

This does **not** block the score. A dimension's session metrics union together, and membership
resolves from columns that already exist: the source, and the signal id joined against the eligible
signal set. The union does not care which flagger fired.

It blocks two other things. The cause list names each cause, and a row reading "a flagger fired" is
useless. And the confidence panel reports how much of a dimension's evidence came from deterministic
flaggers rather than sampled ones, which needs the slug.

Two ways to get it. Read Postgres and join to the ClickHouse session ids, which needs an expression
index on the metadata field and can return a lot of rows for a busy project per window. Or add a
`flagger_slug` column to the ClickHouse `scores` table, backfilled from Postgres.

The column is the better trade. It is one append-only migration, it keeps the daily job to pure
ClickHouse, and it is useful beyond the score for signal patterns and tool analytics.

## What does not change

The flagger registry keeps its shape. No flagger is removed, and no flagger's polarity is inverted.

`empty-response` gains a second consumer rather than a change. The score reads it as
`sessions.no_output`, replacing an earlier design that read the trace rollup for absent output. The
flagger is better on three counts: it looks at the last assistant turn rather than at a whole trace,
it treats a turn holding a tool call or reasoning as production so a delegating turn is not empty, and
it returns no match when the conversation holds no assistant message at all. That last point is the
guard the rollup read would have needed, and it is already there.

`low-cache-hit-rate` keeps running and keeps producing signals. The score no longer reads it as a
defect, because [`cost.cache_gap`](metrics.md#costcache_gap) measures caching against a ceiling
derived from the project's own traffic instead of against a fixed threshold. The flagger's own
threshold remains a reasonable line for raising a signal a human should look at.

Flaggers stay switchable per project. A project that disables one loses that evidence, the affected
dimension reports lower confidence, and the score never rises as a result. This is why
`spans.finish_ruined` and `spans.provider_error` stay sourced from telemetry rather than from a
flagger, since telemetry cannot be switched off.
