# Agent Score

The Agent Score page uses one selected UTC date for the score, dimension values, evidence, and
computation requirements. The date is stored in the route's `date` search parameter. Without a
selected date, the page opens the latest published score through today. If no score exists, it
opens today. The latest lookup has no history-range limit.

A selected date uses an exact snapshot lookup. An unscored date never borrows an older score.
The 7-day or 30-day history graph ends on the selected date. Missing days remain gaps. A published
selected date shows the graph, even when today's computation is pending. Dates without a score
show their computation requirements when available. Query keys include the selected date, so
navigation cannot reuse another day's score or evidence while the next request loads.

## Published evidence

`latitude.agent_score_snapshots.explanation` is a nullable JSONB column containing the domain
`AgentScoreExplanation`. The worker inserts the score and explanation in the same row. The existing
organization/project/date unique key makes that write atomic and immutable. A repeated or forced
calculation cannot replace either the score or its stored explanation.

The explanation retains cause attribution, observed causes, issue summaries, coverage, readiness,
native values, example session references, artifact versions, and computation time. It does not
copy raw session or generation content. History queries exclude the evidence payload.

`getAgentScoreExplanation` reads stored evidence first. Cache expiry or cache loss does not remove
published evidence. The date cache remains useful for unpublished computations and legacy scores.
The page accepts fallback cache evidence only when its date and scoring version match the selected
score. Missing evidence is an explicit empty state; evidence from another date is never substituted.
Legacy snapshot rows can have no stored explanation. Expired legacy evidence cannot be recovered
exactly by recomputing current data.

Refresh operates on the selected date. A score with stored evidence only needs a data reload.
An unscored date or a legacy score without stored evidence can request a calculation for that date.
A forced calculation can refresh legacy cached evidence but cannot rewrite the published snapshot.

## Evidence requirements

`agent-score-v3-provisional` uses 100 eligible sessions for both the window target and publication
minimum. Outcome, Reliability, Speed, and Safety retain their 100-session count requirements.
Percentage coverage requirements are unchanged. Window selection still uses whole-week steps and
hysteresis. Historical snapshots retain their original scoring versions; the trend marks a range
that crosses versions.

## Local seed data

After the standard Postgres and ClickHouse seeds, run
`pnpm --filter @app/workers agent-score:seed --days 3` to calculate three daily snapshots and their
stored evidence for the seed project. The seed uses the same computation as the daily worker.

Use `--end-date YYYY-MM-DD` to stop on an earlier UTC date. Ending yesterday leaves today without a
snapshot, which exercises the default-date and empty-date states. The seed rejects future end dates.
Existing snapshots remain immutable when the command runs again.
