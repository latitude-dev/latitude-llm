# Agent Score

## Execution and recovery

The daily BullMQ sweep selects eligible projects and publishes one lightweight `snapshotProject`
task per project and UTC date. That task starts `agentScoreSnapshotWorkflow` with a workflow ID that
contains the organization, project, date, and request mode. Forced refreshes use a distinct workflow
ID, so an active scheduled run cannot discard a request to rebuild legacy evidence. It does not
calculate the score in the BullMQ worker.

Temporal runs the calculation in `snapshotAgentScoreActivity`. The activity owns the scoped
Postgres, ClickHouse, and cache reads, derived sampling updates, and conditional snapshot insert.
Temporal records the execution history and retries transient activity failures with the shared
bounded retry policy. The organization/project/date unique key makes activity retries safe. A retry
cannot replace an existing score or its stored explanation.

Starting the same workflow while it is running is a successful no-op. A later refresh can start a
new run with the same workflow ID after the earlier run has closed. Workflow and activity logs carry
the organization, project, and score date so operators can follow the run in Temporal and the
application logs.

Customer and backoffice refresh actions start Temporal directly. They do not depend on BullMQ.

The Agent Score page uses one selected UTC date for the score, dimension values, evidence, and
computation requirements. The date is stored in the route's `date` search parameter. Without a
selected date, the page opens the latest published score through today. If no score exists, it
opens today. The latest lookup has no history-range limit. The global `@repo/ui` `DateRangePicker`
uses single-day mode here; selection and day arrows retain UTC date
semantics and cannot advance beyond today. Displayed composite scores are floored to whole
numbers; stored scores and dimension calculations retain their precision.

The page reads the Temporal descriptions for both the scheduled and forced workflow IDs for the
selected date. Any non-terminal execution is shown as an in-progress calculation, including after
a reload or navigation back to the page. The page polls more often while work is active and keeps a
lower-frequency check while it is idle so externally started calculations also appear. During a
calculation, Refresh is disabled and the current score and evidence remain visible. The workflow
run and status form a query marker, so score, history, and evidence reload when the execution
changes state. Placeholder data is reused only for the same UTC date.

A selected date uses an exact snapshot lookup. An unscored date never borrows an older score.
The 7-day or 30-day history graph ends on the selected date. Missing days remain gaps. A published
selected date shows the graph, even when today's computation is pending. Dates without a score
show their computation requirements when available. Query keys include the selected date, so
navigation cannot reuse another day's score or evidence while the next request loads.

## Shareable score images

The camera action in the vitality panel opens a snapshot modal with a PNG preview, Copy image,
and Download PNG. The image captures the selected published score and its five dimensions at
click time. Unpublished dates disable the action; missing dimensions display a dash. Copy and
download use the same generated PNG. Clipboard failures show a toast, unsupported image copying
leaves download available, and generation failures offer a retry.

`agent-score-snapshot.ts` renders the 1270-square Figma composition to a 2540-square canvas export.
It uses the original background PNGs and exported headline/branding assets from
`public/agent-score-snapshot/`, plus locally served Inter fonts. No project data or generated
images are uploaded. The export palette is separate from the dashboard: scores below 60 use red,
60–79 use blue in place of yellow, and scores of 80 or more use green. The overall score selects
the background; each disc uses its own solid score-band color without a gradient. The central number is floored and the smaller
numbers use the page's dimension rounding.

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

`agent-score-v5-provisional` uses 50 eligible sessions for both the window target and publication
minimum. Outcome requires 50 compatible verdicts, Reliability requires 50 readable sessions, Speed
requires 50 complete critical paths, and Safety requires 50 compatible evaluations. Percentage
coverage requirements are unchanged. Window selection still uses whole-week steps and hysteresis.
Historical snapshots retain their original scoring versions; the trend marks a range that crosses
versions.

## Frozen latency references

Speed loads the calibrated `latency-reference-v2-calibrated-20260921` artifact. It was built from
the closed fleet window from 2026-06-23 through 2026-09-21 and the exclusive ingestion snapshot at
2026-09-21 08:00 UTC, with a minimum of 200 observations and 5 organizations for every published
cohort. The artifact contains detailed input/output token and streaming cohorts plus provider/model
roll-ups. A detailed miss can use its exact provider/model roll-up. It never uses another model or a
fleet-wide fallback.

An exact provider/model pair that is absent from the artifact is unmeasured. If an applicable
critical-path generation uses that pair, Speed does not publish. This includes a model introduced
after the freeze and a model that has not reached the sample or organization gate. The fail-closed
result preserves score comparability and prevents a thin tenant-specific cohort from becoming a
shared reference.

Create a later freeze with `pnpm --filter @app/workers agent-score:calibrate-latency`. The command
requires an inclusive `--since`, an exclusive `--until`, an exclusive `--ingested-until` snapshot,
and a new `--artifact-version`. It writes the deterministic TypeScript artifact to stdout and the
cohort and rejection report to stderr. A reviewed freeze replaces the bundled artifact and bumps
the Agent Score scoring version. Score jobs never query live fleet distributions, so reference
values change only through a reviewed release.
Run this before a new model becomes score-bearing when the fleet already has enough evidence, and
rerun it when `missingLatencyReference` coverage shows that active models have reached the gates.

```bash
pnpm --filter @app/workers agent-score:calibrate-latency -- \
  --since 2026-06-23T00:00:00.000Z \
  --until 2026-09-21T00:00:00.000Z \
  --ingested-until 2026-09-21T08:00:00.000Z \
  --artifact-version latency-reference-v2-calibrated-20260921 \
  > packages/domain/agent-score/src/artifacts/launch-latency-reference-artifact.ts
```

## Local seed data

After the standard Postgres and ClickHouse seeds, run
`pnpm --filter @app/workers agent-score:seed --days 3` to calculate three daily snapshots and their
stored evidence for the seed project. The seed uses the same computation as the daily worker.

Use `--end-date YYYY-MM-DD` to stop on an earlier UTC date. Ending yesterday leaves today without a
snapshot, which exercises the default-date and empty-date states. The seed rejects future end dates.
Existing snapshots remain immutable when the command runs again.
