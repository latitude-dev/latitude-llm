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
  severity: "low" | "medium" | "high"
}
```

`target.type` is the product category used for creation and list filters. `target.stream` is derived from `target.type` on load (`tool` → `spans`, `session` → `sessions`, everything else → `traces`), not free-form. Tool, user, and session targets carry inline filter/query inputs. Saved-search targets store the saved-search id and resolve the saved search live at evaluation time, so monitor checks follow saved-search edits instead of duplicating the saved-search predicate.

## Target x Trigger

All monitor kinds use the same target x trigger matrix:

| Trigger | Condition | Incident lifecycle | Notification key |
| --- | --- | --- | --- |
| `match` | none | point event, `ended_at = started_at` | `monitor.match` |
| `threshold` | metric threshold over the target window | point event, `ended_at = started_at` | `monitor.threshold` |
| `escalating` | sustained count escalation | open/close incident | `monitor.escalating` |

Supported metrics are:

- `count`
- `errorRate`
- `sum`, `min`, `max`, `avg`, and `median` over `duration`, `cost`, or `tokens`

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
  severity: "low" | "medium" | "high"
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

Point monitors (`match`, `threshold`) insert an event row with `endedAt = startedAt` every time the rule fires. Escalating monitors use the sustained path: one open row per monitor, closed when `EscalationEngine` exits.

## Evaluation

`checkMonitorsUseCase` is the monitor evaluator. It loads active project monitors, drops muted monitors, and evaluates the remaining rules.

Point rules use `MetricSeriesReader` directly:

- `match` fires when any matching row exists in the lookback window, backdating the incident's `started_at` to the first event.
- `threshold` computes the configured metric value over the window and compares it to the configured threshold (absolute, multiplier-over-baseline, or seasonal/expected).

Before reading ClickHouse, saved-search monitor targets resolve their current saved-search `filterSet` and `query`; if the saved search has been deleted, that monitor is skipped until the delete cascade removes it. Escalating rules adapt `MetricSeriesReader` into the incidents package's generic `SeriesReader` and then call `EscalationEngine`. The engine owns the sustained state machine, including seasonal expected-mode thresholds, entry snapshots, dwell exits, and hard timeouts. This is the same engine used for signal escalation; the reader decides which source produces the bucket series.

The ClickHouse adapter is `MetricSeriesReaderLive` in `@platform/db-clickhouse`. It turns a target's `(stream, filterSet, query, metric)` into per-stream ClickHouse queries (over `traces`, `spans`, or `sessions`) and returns:

- point/window values for threshold checks
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
- At most one *open* incident per `(organization_id, source_type, source_id)` — enforced by a partial unique index on `incidents` where `ended_at IS NULL`. Point incidents (`ended_at = started_at`) are not open and do not contend for this slot.
- Escalating monitors must use count series.
- Organization/project scoping is enforced at repository and boundary layers; Postgres follows the repo's no-FK rule.
