# Agent Score

The Agent Score is a project-level number from 0 to 100 that summarizes current production agent behavior. It is a weighted mean of five dimensions — Outcome, Reliability, Cost, Speed, and Safety — each with its own estimator, 95% interval, and coverage floors.

Domain code lives in `@domain/agent-score` (`packages/domain/agent-score`). The per-session evidence read model that feeds the benchmark is documented in [`session-assessment.md`](./session-assessment.md). Signal scoring roles, flagger screening, and conversation moments are covered in [`signals.md`](./signals.md), [`flaggers.md`](./flaggers.md), and [`conversation-intelligence.md`](./conversation-intelligence.md).

**Agent Score** refers only to the project benchmark. The existing session **Scores** surface holds evaluation, annotation, and custom score records. Shared contracts use `scoreDimension` so benchmark dimensions do not collide with analytics dimensions elsewhere in the product.

## Five dimensions

| Dimension | Question | Composite weight |
| --- | --- | --- |
| Outcome | Did the agent accomplish what the user asked? | 0.35 |
| Reliability | Can the agent complete sessions without terminal operational failure? | 0.25 |
| Cost | How efficiently did the agent use paid and token-bearing resources? | 0.15 |
| Speed | How much user-visible critical-path time was necessary? | 0.15 |
| Safety | How likely is the agent to avoid confirmed harmful output? | 0.10 |

Outcome measures task success. Reliability measures operational completion. Cost and Speed measure efficiency, not raw spend or latency. Safety measures agent-caused harm; exposure to hostile or sensitive user content is context and does not lower the score unless the agent produced or disclosed something it should not have.

Reliability is always presented with the one-session operational success rate beside the reference-run probability (20 consecutive successes). Cost combines five fixed families — spend, context, tools, memory, and recovery — each in its own native units before the family weights are applied.

## Architecture

```
apps/web (Agent Score page)
    ↓ server functions / collections
@repo/operations (GET /agent-score, /history, /causes)
    ↓
@domain/agent-score
    ├── readers/          bulk and single-session assessment input
    ├── resolver/         session assessment (shared with Scores panel)
    ├── scoring/          window estimators, composite, attribution
    ├── use-cases/        compute, get current/history, explanation cache
    └── ports/            ScoreWindowSource, AgentScoreSnapshotRepository, …
         ↓
@platform/db-clickhouse   telemetry bulk reads, window session counts
@platform/db-postgres     snapshots, scores, signals, screening decisions
@platform/cache-redis     explanation cache (26h TTL)
apps/workers              daily sweep + per-project snapshot tasks
```

The daily job reads retained telemetry and current persisted judgments once per eligible session batch. It does not call the interactive single-session use case per session. Session assessment resolution, evidence roles, deduplication, and coverage semantics are identical between the Scores panel and the benchmark.

## Window selection

The score uses the shortest whole-week step that contains at least 1,000 eligible sessions:

1. 7 days
2. 14 days
3. 21 days
4. 28 days

Eligible sessions are production sessions with LLM activity, no simulation id, and last activity before the cutoff (end of the UTC date, clamped to now, with the standard five-minute session-end debounce). The score is withheld below 200 eligible sessions.

Window choice is sticky: yesterday's stored `window_days` on the snapshot drives hysteresis. The window does not shorten until the shorter step exceeds the target by 10%, and does not lengthen until the current step falls 10% below the target.

## Publication gate

The composite and all five dimension numbers are published only when every dimension passes its traffic, coverage, and confidence floors. If one dimension is unmeasured, no numeric scores are shown — not a partial composite with a gap. An unmeasured dimension does not display 0, 100, or a neutral midpoint.

When the gate fails, the UI and API still expose observed evidence, readiness requirements, session counts, and deterministic waste amounts that are exact at small samples. Derived sampling rates are written even on a withheld run so projects below sampled-reader floors can see what to adjust.

## Snapshots and explanation

Two persistence layers serve different contracts.

**Daily snapshots** (`agent_score_snapshots` in Postgres) are immutable per project per UTC date. A published snapshot stores the composite and dimension point estimates with 95% intervals, `scoring_version`, `window_days`, `eligible_session_count`, and an optional `policy_cap`. It does not store sessions, metrics, signals, causes, or coverage breakdowns. Re-running a date that already published is a no-op. Days without publication are gaps in history, not zero-filled points.

**Explanation cache** (Redis, keyed per organization and project) holds the cause rows, Outcome issue tables, and Safety harm/exposure tables for the live selected window. It is warmed when a snapshot publishes and expires after 26 hours. `GET /causes` returns `status: "notComputed"` when the cache is cold; the stored scores remain valid. Causes explain present behavior and do not reconstruct a historical snapshot decomposition.

The headline score for today uses the current UTC date's snapshot only. A stale score is never substituted when today's snapshot was not published.

## Public API

Operations live in `packages/operations/src/operations/agent-score.ts` and mount at `/v1/projects/{projectSlug}/agent-score`:

| Operation | Path | Purpose |
| --- | --- | --- |
| `getAgentScore` | `GET /` | Today's published score or explicit absence |
| `listAgentScoreHistory` | `GET /history` | Published snapshots in a date range, oldest first |
| `getAgentScoreCauses` | `GET /causes` | Ranked causes and issue concentration from the live window |

The same contracts reach MCP (`getAgentScore`, `listAgentScoreHistory`, `getAgentScoreCauses`), the TypeScript and Python SDKs (`client.agentScore.*`), and the CLI (`latitude agent-score get|history|causes`).

Per-session evidence without raw telemetry payloads is available separately at `GET /v1/projects/{projectSlug}/sessions/{sessionId}/assessment` (see [`session-assessment.md`](./session-assessment.md)).

## UI page

The project Agent Score page is first in the Observe group, above Sessions. It is gated behind the `agentScore` feature flag (`apps/web/src/domains/projects/project-sections.ts`).

The page has two levels:

1. **Vitality card** — score ring, weighted dimension bars, trend chart, and context metrics (raw cost per session and median TTFT, labelled as not scored directly).
2. **Dimension sections** — one section per dimension with native measurements, coverage, ranked causes, and investigation destinations.

Readiness states drive loading and unavailable UI:

- **`ready`** — publication gate passed; numeric scores and cause tables render.
- **`collecting`** — evidence is accumulating toward a floor (for example Outcome or Safety evaluations still sampling).
- **`actionNeeded`** — a reader floor failed for a reason the project can address (for example insufficient critical-path coverage for Speed).

When causes are not cached yet, dimension sections show a not-ready state rather than empty tables. The trend chart marks scoring-version changes, window-length changes, policy caps, and dates without a published score as gaps.

## Background jobs

The `agent-score` queue has two task kinds:

| Task | Handler | Behavior |
| --- | --- | --- |
| `sweep` | `fanOutAgentScoreSweep` | Resolves today's UTC date and cutoff once, lists projects at or above the session floor, publishes one `snapshotProject` task per project |
| `snapshotProject` | `snapshotProjectAgentScore` | Runs `computeAgentScore`, writes a snapshot when the publication gate passes, caches the explanation, and persists derived sampling rates |

The sweep resolves `date` and `to` once and carries them on every payload so a fan-out that crosses midnight does not score half the fleet for different days. Projects below the session floor are not published to at all.

Worker entry: `apps/workers/src/workers/agent-score.ts`. Snapshot logic: `apps/workers/src/workers/agent-score-snapshot.ts`.

## Scoring version and artifacts

`LAUNCH_AGENT_SCORE_ARTIFACT` (`packages/domain/agent-score/src/artifacts/launch-agent-score-artifact.ts`) pins composite weights, reference-run horizons, window settings, dimension coverage floors, and compatible judgment versions for the bundled judge model. Cost curves, the cost metric catalog, and fleet latency references are separate versioned artifacts resolved through `resolveLaunchArtifacts`.

A scoring-version change marks a discontinuity on the trend chart. Hosted and self-hosted deployments load the same formulas and artifacts. A self-hoster that substitutes an unsupported judge model receives a distinct local scoring version and cannot pass the Outcome or Safety publication gate without compatible judgment versions.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm seed:agent-score` | Seeds Agent Score evidence for the default project and publishes a multi-day trend (also runs at the end of `pnpm seed` and `pnpm db:reset`) |
| `pnpm --filter @app/workers agent-score:seed` | Same, with `--organization-id`, `--project-id`, and `--days` options |
| `pnpm --filter @app/workers agent-score:shadow` | Reports what Cost and Speed would say over a window without writing snapshots |

The ClickHouse seed includes an `agentScoreHistorySeeder` that emits deterministic span history for the benchmark window. The Postgres seed includes promoted signals with score-evidence fixtures spanning every dimension.

Staff can force-refresh a project's explanation from the backoffice project page without recomputing the published score (`force` on `snapshotProjectAgentScore`).

## Invariants

- Metrics and signals do not own independent point budgets; influence comes from measured outcomes, failure probabilities, family-native penalties, time, or safety risk.
- Overlap is resolved at session level before window aggregation.
- Ignored signals exclude their assigned scores from current and future calculations without rewriting existing snapshots.
- Simulations and user-created signals do not move the score.
- Cause fix gains can overlap and must not be summed; attributed deficits within a dimension do add up.
- Signal rows use "associated" language unless the observation itself identifies avoidable work or a terminal failure.
