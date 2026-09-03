# Monitors

A **Monitor** is a project-scoped rule over a trace-derived target. It answers two questions:

- **Target:** what stream of traces is being watched?
- **Rule:** what condition opens an incident?

Monitors live in `@domain/monitors`. Incidents live in `@domain/incidents` and are keyed by `(source_type, source_id)`, where monitor-created incidents use `source_type = "monitor"` and `source_id = monitors.id`. Notifications are downstream of incidents; monitors only provide the incident source and a mute gate.

Related docs:

- [signals.md](./signals.md) - signal discovery, signal mute, and signal escalation incidents.
- [notifications.md](./notifications.md) - incident fan-out, project gates, user preferences, and channel workers.
- [reliability.md](./reliability.md) - the score and signal loop that monitor targets can observe.

## Model

| Concept | Where | What it is |
| --- | --- | --- |
| **Monitor** | `monitors` table, `@domain/monitors` | The user-facing watch. It owns exactly one target and one rule. |
| **Target** | `MonitorTarget` | The stream and filter/query context. Supported target types are `savedSearch`, `tool`, `user`, and `session`. |
| **Rule** | `MonitorRule` | The trigger, condition/config, and severity copied onto incidents. Supported triggers are `match`, `threshold`, and `escalating`. |
| **Incident** | `incidents` table | The canonical alert lifecycle row. Monitor incidents use `source_type = "monitor"` and `source_id = monitor.id`. |
| **Mute** | `monitors.muted_at` | Muted monitors are skipped by `checkMonitorsUseCase`, so they do not open new incidents while muted. |

The persisted monitor shape is:

```ts
type Monitor = {
  id: MonitorId
  organizationId: OrganizationId
  projectId: ProjectId
  slug: string
  name: string
  description: string
  system: boolean
  target: MonitorTarget
  rule: MonitorRule
  mutedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type MonitorTarget = {
  type: "savedSearch" | "tool" | "user" | "session"
  id: string | null
  filterSet?: FilterSet | null
  kind: "savedSearch" | "tool" | "user" | "session"
  stream: "traces" | "spans" | "sessions"
  query: string | null
  savedSearchId: string | null
  metric: MonitorMetric
}

type MonitorRule = {
  trigger: "match" | "threshold" | "escalating"
  config: MonitorConfig
  severity: "low" | "medium" | "high" | "urgent"
}
```

`target.type` is the product category used for creation and list filters. `target.stream` is derived from `target.type` on load (`tool` → `spans`, `session` → `sessions`, everything else → `traces`), not free-form. Tool, user, and session targets carry inline filter/query inputs. Saved-search targets store the saved-search id and resolve the saved search live at evaluation time, so monitor checks follow saved-search edits instead of duplicating the saved-search predicate.

## Target x Trigger

All monitor kinds use the same target x trigger matrix:

| Trigger | Condition | Incident lifecycle | Notification key |
| --- | --- | --- | --- |
| `match` | none | point event, `ended_at = started_at` | `monitor.match` |
| `threshold` | metric threshold over the target window | open/close incident; alerts once on open, closes silently after the exit dwell | `monitor.threshold` |
| `escalating` | sustained count escalation | open/close incident | `monitor.escalating` |

Supported metrics are:

- `count`
- `errorRate`
- `cacheHitRate` — token-weighted prompt-cache hit rate: `cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreateTokens)`, stored and compared as a 0..1 fraction; UI and monitor copy display it as a percentage
- `sum`, `min`, `max`, `avg`, and `median` over `duration`, `cost`, or `tokens`

`cacheHitRate` is most useful with a `below` threshold to alert when caching degrades on large sessions. It is available on all target streams (`traces`, `spans`, `sessions`).

There is no p95 monitor metric in the current contract.

Rule conditions are stored inside `rule.config.condition`:

```ts
type AlertIncidentCondition =
  | {
      trigger: "threshold"
      metric: MonitorMetric
      threshold: AlertMetricThreshold
      direction?: "above" | "below"
    }
  | {
      trigger: "escalating"
      metric: MonitorMetric
      threshold?: AlertMetricThreshold
      direction?: "above" | "below"
      sensitivity?: number
      window?: { minutes: number }
    }
```

Create/update validation keeps the rule coherent:

- `match` rules cannot carry a condition.
- `threshold` and `escalating` rules must carry a condition whose `trigger` matches the rule trigger.
- `escalating` rules are count-only (the rule metric and condition metric must both be `count`). The seasonal engine reads count series.
- An `escalating` condition that carries a `threshold` must use `expected` mode; absolute and multiplier thresholds are rejected for escalating.

## Incidents

The incident table is the single alert hub:

```ts
type Incident = {
  id: AlertIncidentId
  organizationId: OrganizationId
  projectId: ProjectId
  sourceType: "monitor" | "signal"
  sourceId: string
  severity: "low" | "medium" | "high" | "urgent"
  startedAt: Date
  endedAt: Date | null
  createdAt: Date
  entrySignals: IncidentEntrySignals | null
  exitEligibleSince: Date | null
  condition: AlertIncidentCondition | null
}
```

Monitor evaluation inserts incidents with:

- `sourceType: "monitor"`
- `sourceId: monitor.id`
- `severity: monitor.rule.severity`
- `condition: null` for `match`, or the rule condition snapshot for threshold/escalating

`match` monitors are point events: they insert a row with `endedAt = startedAt` the first time each matching entity is seen (see [Two time axes](#two-time-axes)). `threshold` and `escalating` monitors use the sustained path: one open row per monitor while the condition holds. `threshold` opens an incident on first breach (freezing the evaluated threshold into `entrySignals` so the close-side compares against what tripped it, not a drifting baseline), then closes it once the condition has been clear for `THRESHOLD_EXIT_DWELL_MS` (`exitEligibleSince` tracks the dwell). A `threshold` incident alerts once on open (`incident.event`) and closes **silently** — no `IncidentClosed` event, so no recovery notification; closing simply re-arms a fresh alert if the breach recurs. `escalating` incidents close when `EscalationEngine` exits (and do notify on close).

## Two time axes

Monitor evaluation windows filter on the **end-time axis** — `max(max_end_time)` for the `traces`/`sessions` rollups, the span's own `end_time` for `spans` — while every other consumer of the shared metric-sql descriptors keeps the **start** axis. `MetricSqlInput.windowAnchor` carries the choice (default `"start"`); only `MetricSeriesReaderLive` passes `"end"`, so `queryAnalytics`, experiment metrics, and the dashboards are untouched. Before the flip, a run's `start_time` had aged out of the 5-minute window by the time its trace-end triggered the check, so runs longer than the window could never alert (LAT-885).

An incident's `startedAt` stays on the **start** axis: `firstEventAt` reads `min(start_time)` over the matched entities, and a match incident backdates to the earliest newly alerted entity's start. The window answers "should this alert now", `startedAt` answers "when did the offending run begin", and an incident can therefore start ~40 minutes before its `createdAt`. This is deliberate, not an inconsistency to unify. Downstream consequences: the monitors list ranks recency by the incident's `createdAt`, the histogram marker code clamps a backdated incident to the left edge instead of dropping it, and incident duration displays intentionally show the whole backdated span.

Two more evaluation-time rules follow from the anchor:

- **Fixed date ranges are stripped.** `withoutFixedTimeConditions` drops `startTime`/`endTime` conditions from a resolved predicate (saved-search and inline targets alike, plus the monitor detail chart's own resolution). A saved search built from the dashboard date picker carries an absolute range that would silence the monitor once it aged out; the search keeps the range for dashboard use.
- **`seriesPerBucket` buckets on the same end column the window filters on.** Bucketing on `start_time` while windowing on `end_time` would assign in-window rows to out-of-range bucket indexes, which the densify loop drops silently.

On the **traces** stream the backdate is the earliest start among the entity's *in-window* traces, not the entity's lifetime start: a session whose first turn ran an hour ago and whose latest turn is what matched backdates to that latest turn. The **sessions** stream reports the session's lifetime start for the same shape, because its rollup folds every trace into one row. Both readings are intentional — "this turn began" vs "this session began" — and follow from the target's stream.

Surfaces that display an incident have to pick an axis deliberately:

- **Recency** (the monitors list's `lastIncident` sort, and the status pill for point incidents) uses `createdAt`. A match incident backdated an hour would otherwise sort below older alerts and read "Closed 1 hour ago" when it fired minutes ago. The ranking has to hold in `MonitorRepository.list`'s SQL, not just the client comparator — the page is cut server-side, so a low-ranked monitor never reaches the client to be re-sorted.
- **Chart markers** follow the axis of the bars they sit on: `buildIncidentMarkers({ timeAxis })` takes `"start"` for the start-anchored sessions histogram and `"raised"` for the monitor's own activity-anchored chart. Mixing them draws the marker over an empty bucket. `IncidentRepository.listByProjectId` also matches incidents *raised* inside the window (`created_at >= from`), since a match incident's whole lifetime is one backdated instant and would otherwise never be fetched for the window it fired in.
- **Duration and "Ongoing since"** stay on `startedAt` — the breach really has been running since the run started.
- **"Matching sessions"** and its "View all" link both apply the monitor's *effective* predicate (ranges stripped) so the panel, the link's destination, the chart and the incidents all agree.

Known consequences we accept rather than fix: notification copy derives its trend window from `startedAt`, so a backdated incident's email describes the window around the run's start; an escalating incident's `startedAt` is snapshotted at the enter transition while a live run slides between end-anchored buckets across checks; an analytics chart plots a monitor-detected spike at a different x-position than the monitor's firing time, because the two axes differ by design; and `lastActivityTime` in the UI is the latest span's *start* while the window filters on its *end*, so a session whose final span is long reads slightly earlier than the moment that matched it.

## Check cadence

Two triggers publish `checkSavedSearchMonitors`, both coalescing on `savedSearchMonitorsCheckDedupeKey`: `trace-end` (90 s after a trace goes quiet) and a 5-minute sweeper cron. The publish carries a **leading** throttle, so the first one runs immediately and the rest are dropped until the marker lapses.

The throttle must stay **strictly shorter than the evaluation window**. With both at 5 minutes the sweeper tick raced the previous marker's expiry and lost, so every other tick published nothing: the real cadence was 10 minutes against a 5-minute window, activity that landed in a skipped window was never evaluated, and threshold closes slipped a full tick. `SAVED_SEARCH_MONITORS_THROTTLE_MS` is 4 minutes for that reason, guarded by a test in `constants.test.ts`. Slightly overlapping windows are harmless: match monitors dedupe per entity and threshold/escalating incidents are idempotent per episode.

A monitor's predicate is persisted in `config.filterSet` and read back onto `target.filterSet` — `toMonitorRow` folds the target's own filters in, because the public API sends the predicate on the target while the web sends it in both places. A caller whose filters never reach `config` produces a monitor that evaluates against the whole project.

## Evaluation

`checkMonitorsUseCase` is the monitor evaluator. It loads active project monitors, drops muted monitors, and evaluates the remaining rules.

Point rules use `MetricSeriesReader` directly:

- `match` reads the entities matching in the lookback window, drops the ones already alerted for, and opens one incident for the rest, backdating `started_at` to the earliest of their start times.
- `threshold` computes the configured metric value over the window and compares it to the configured threshold (absolute, multiplier-over-baseline, or seasonal/expected). A live long run contributes to every consecutive window while it runs; "activity in the window" is the intended semantic, since ClickHouse has no settledness flag (trace-end re-fires mid-run) and alerting before a 40-minute run finishes is the point.

### Match dedupe

A live run sits inside `[now - 5min, now)` on **every** check until it finishes, so match monitors alert **once per entity**:

- `MetricSeriesReader.matchingEntities` returns `{ id, startTime }` per matching entity, capped at 1000, at the count metric's dedup grain (traces coalesce to session-or-trace, sessions to `session_id`, spans to `span_id`) — so a session's three matching traces are one entity, matching what the count metric reports.
- Alerted entities are marked in Redis through the `CacheStore` port under `matchAlertedDedupeKey` (`org:${organizationId}:monitors:match-alerted:${monitorId}:${entityId}`) with a 24h TTL.
- Markers are written **after** the incident transaction commits, so a failed insert retries cleanly; checks are serialized per project, so there is no race. Redis cannot join that transaction, so a marker write failing after the commit leaves the entity unmarked and the next check alerts for it again. That direction is deliberate: a duplicate alert on infrastructure failure beats marking first and silently dropping the alert when the insert is what fails. Making the two atomic would mean persisting the dedupe state in Postgres alongside the incident — worth doing only if this is ever observed.
- A `CacheError` fails that monitor's evaluation rather than alerting anyway, which would spam on a Redis flap.
- Muted monitors don't evaluate and so record no markers: unmuting may alert for a run that matched while muted if it still has activity in the window. Accepted.

Before reading ClickHouse, saved-search monitor targets resolve their current saved-search `filterSet` and `query`; if the saved search has been deleted, that monitor is skipped until the delete cascade removes it. Escalating rules adapt `MetricSeriesReader` into the incidents package's generic `SeriesReader` and then call `EscalationEngine`. The engine owns the sustained state machine, including seasonal expected-mode thresholds, entry snapshots, dwell exits, and hard timeouts. This is the same engine used for signal escalation; the reader decides which source produces the bucket series.

The ClickHouse adapter is `MetricSeriesReaderLive` in `@platform/db-clickhouse`. It turns a target's `(stream, filterSet, query, metric)` into per-stream ClickHouse queries (over `traces`, `spans`, or `sessions`) and returns:

- point/window values for threshold checks
- the matching entities (id + start time) for match dedupe
- first/last event timestamps for point incidents
- per-bucket series for the escalation engine

## Notifications

Monitors do not own notification preferences or channel routing.

When an incident event reaches `requestIncidentNotificationsUseCase`, the producer derives the project-gated notification key from the incident source and condition:

```ts
if (incident.sourceType === "signal") return "signal.escalating"
if (incident.condition?.trigger === "threshold") return "monitor.threshold"
if (incident.condition?.trigger === "escalating") return "monitor.escalating"
return "monitor.match"
```

Project-level gates live in `projects.settings.notifications.incidents[incidentNotificationKey]`. User channel preferences live in `users.notification_preferences`. Shared-room channels such as Slack route from integration-level route config.

For monitor-sourced incidents, the producer resolves monitor attribution for payload display. If the monitor is muted by the time the producer runs, the producer skips fan-out with `reason: "monitor-muted"`. This second gate protects against races where a monitor is muted after incident creation but before notifications are requested.

## Signals

Signal escalation also writes into the same incidents hub, but with `source_type = "signal"` and notification key `signal.escalating`.

Signals have their own mute field, `signals.muted_at`. Muted signals do not fan out signal escalation notifications. Signal discovery and signal assignment continue to record evidence; mute only suppresses alerting/noise.

Signal discovery notifications are separate from incidents. A new signal can be announced without creating an incident row.

## UI and API

The managed web surface exposes monitors as a single-rule editor:

- Create modals choose a target preset and an initial rule.
- The detail page edits the monitor metadata and rule.
- The rule editor uses `monitor.match`, `monitor.threshold`, and `monitor.escalating` vocabulary in the UI layer, then maps it back to the domain `trigger` + `condition` shape.
- The incidents table reads `sourceType` and `sourceId` from incident rows. `monitor` rows link back to the current monitor context; `signal` rows link to the signal detail page when the signal still exists.

Public API/MCP surfaces follow the same contract: monitor create/update accepts one target and one rule. There are no alert subroutes or alert-card stacks in the final monitor model.

## Operational Invariants

- Every active monitor has exactly one target and one rule.
- Monitor slugs are unique per project among non-deleted rows.
- Soft delete sets `deleted_at`; deleted monitors are hidden and do not fire.
- Deleting a saved search cascades to active monitors with `target.type = "savedSearch"` and `target.id` matching the saved search.
- Mute sets `muted_at`; muted monitors do not evaluate and the notification producer also skips any race-window fan-out.
- Incidents are source keyed by `(source_type, source_id)`, not by a monitor-alert join.
- At most one *open* incident per `(organization_id, source_type, source_id)` — enforced by a partial unique index on `incidents` where `ended_at IS NULL`. `threshold` and `escalating` incidents are open and contend for this slot; `match` point incidents (`ended_at = started_at`) are not open and do not.
- Escalating monitors must use count series.
- Organization/project scoping is enforced at repository and boundary layers; Postgres follows the repo's no-FK rule.
