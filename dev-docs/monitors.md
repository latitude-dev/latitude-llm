# Monitors

A **Monitor** is the user-facing entity that owns _what to watch_ and _when an incident is open_. Each monitor groups one or more **alerts**; when any alert fires, the existing notifications pipeline takes over. Monitors unify the issue-driven alert path with a new saved-search alert path under a single project surface, and add a per-monitor mute gate without owning any notification configuration of their own.

Monitors live in `@domain/monitors`. The shared enums (`AlertIncidentKind`, source types, conditions, severities) live in `@domain/shared` so both the monitors domain and the notifications/incidents pipeline can reference them without a circular dependency.

> Gated by the **`monitors`** feature flag. The new monitor-driven path runs only for orgs with the flag on; orgs without it keep the legacy issue-event path. See [Feature flag](#feature-flag).

Related docs:

- [issues.md](./issues.md) — issue lifecycle events feed the `issue.*` alert kinds; the seasonal escalation detector is shared.
- [reliability.md](./reliability.md) — the cross-domain reliability loop that produces the scores and issues monitors watch.
- [notifications.md](./notifications.md) — incidents drive notifications; monitors set `monitor_alert_id` on the incident and (optionally) mute it, but own nothing else in that pipeline.

## Concepts

| Term | Where | What it is |
| --- | --- | --- |
| **Monitor** | `monitors` table, `@domain/monitors` | A project-scoped entity owning one or more alerts. Mute prevents notifications; soft-delete hides it and stops it firing. |
| **System monitor** | `system = true` | Auto-provisioned per project, not deletable, structurally locked (no add/remove alerts, fixed name/kind/source/severity). Editable surface: mute/unmute plus the configurable values of its predefined alerts (e.g. the `issue.escalating` alert's `sensitivity`). |
| **Alert** (`MonitorAlert`) | `monitor_alerts` table | A `(kind, source, condition, severity)` tuple owned by a monitor. Firing any alert produces an incident. |
| **Alert kind** | `ALERT_INCIDENT_KINDS` in `@domain/shared` | Discriminated enum identifying the watched signal: `issue.new`, `issue.regressed`, `issue.escalating`, `savedSearch.match`, `savedSearch.threshold`, `savedSearch.escalating`. Each kind has a fixed source type. |
| **Alert source** | `source { type, id? }` | The entity the alert watches. `id = null` means "all of that type" in the project. |
| **Alert condition** | `condition` jsonb | Polymorphic config parameterising the kind's evaluator. `null` for kinds that need no parameters. |
| **Severity** | `ALERT_SEVERITIES` in `@domain/shared` | `low \| medium \| high`. Copied onto the incident; drives badge tone and email subject tone. |
| **Incident** | `alert_incidents` table | A row linked to its firing alert via `monitor_alert_id` (and through that alert, to the owning monitor). Point-in-time kinds have `endedAt = startedAt`; sustained kinds leave `endedAt = null` until the condition clears. |

## Conceptual model

```
┌─────────────────────────────────────────────────────────────┐
│ Monitor                                                     │
│   id, organizationId, projectId, slug, name, description    │
│   system: boolean                                           │
│   mutedAt?, deletedAt?, createdAt, updatedAt                │
│                                                             │
│   ┌────────────────────────────┐                            │
│   │ MonitorAlert[] (1..n)      │                            │
│   │   kind                     │                            │
│   │   source { type, id? }     │                            │
│   │   condition?               │                            │
│   │   severity                 │                            │
│   └────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
            │
            ▼   each firing produces
┌─────────────────────────────────────────────────────────────┐
│ AlertIncident                                               │
│   id, organizationId, projectId                             │
│   monitorAlertId? ── join → MonitorAlert → Monitor          │
│   condition? (snapshotted)                                  │
│   sourceType, sourceId, kind, severity                      │
│   startedAt, endedAt?                                        │
│   entrySignals?, exitEligibleSince?                          │
└─────────────────────────────────────────────────────────────┘
            │
            ▼   IncidentCreated / IncidentClosed
┌─────────────────────────────────────────────────────────────┐
│ existing @domain/notifications pipeline                     │
│   request-incident-notifications                            │
│     if incident.monitorAlertId, resolve its monitor (join   │
│     through monitor_alerts, incl. soft-deleted); if         │
│     monitor.mutedAt, skip the whole fan-out. Project-level  │
│     gates + user prefs still apply.                         │
│   → create-notification → notification-email:send → …       │
└─────────────────────────────────────────────────────────────┘
```

Monitors **do not own notification configuration**. Notification settings live where they already do — per-organization and per-project gating on `projects.settings.notifications` and `users.notification_preferences`. The single new wire from monitors into the notifications domain is the mute gate: when a monitor-driven incident reaches the notifications producer and that monitor is muted, the producer skips the fan-out so no notification rows are written.

### Cardinality rules

- A monitor has **at least one alert**. Enforced in the create/update use-cases, not as a DB constraint.
- Multiple alerts on a single monitor are allowed in any combination — both within the same kind and across kinds.
- The data model places no restriction on which source types appear on system vs user-managed monitors. The two product rules below are enforced in code via constants, not schema:
  - **System monitors are structurally locked.** The create/update use-cases reject adding, removing, or replacing alerts and changing an alert's `kind`/`source`/`severity`, and reject deleting the monitor or editing name/description. What stays editable: `mutedAt`, and the *configurable values* of each predefined alert (its `condition` parameters — e.g. the `issue.escalating` alert's `sensitivity`; `issue.new`/`issue.regressed` carry `null` conditions, so nothing to tune). The data model is agnostic to source type — future system monitors of any source type are unblocked.
  - **User-creatable monitors** are restricted by the `USER_CREATABLE_ALERT_KINDS` allowlist (today: the three `savedSearch.*` kinds). Opening more kinds is a one-constant edit, no migration.

### Lifecycle

- **Mute** sets `mutedAt = now()`. Incidents continue to be created; the notifications producer short-circuits when `incident.monitorAlertId` resolves (through its alert) to a muted monitor.
- **Soft delete** sets `deletedAt = now()` (user-managed monitors only; the use-case rejects `system === true`). The monitor disappears from lists and stops firing. Existing incidents remain queryable.
- **Source cascade** — when a referenced source entity (issue or saved search) is hard- or soft-deleted, every alert with `source.id === <deletedEntityId>` is **soft-deleted** (never hard-deleted, so `alert_incidents.monitor_alert_id` pointers stay resolvable). If that empties a monitor's active alert list, the monitor is soft-deleted in the same transaction. System monitors are unaffected because their alert sources are configured `id = null`.
- **Removing the last alert** from a user-managed monitor is rejected by the update use-case; the UI offers "Delete monitor" once the last alert is about to go.

## Data model

Field-level comments below land verbatim in code (entity-level JSDoc), so readers can `cmd-click` and understand each field without re-deriving it.

### Shared enums (`@domain/shared`)

```ts
export const ALERT_INCIDENT_SOURCE_TYPES = ["issue", "savedSearch"] as const
export type AlertIncidentSourceType = (typeof ALERT_INCIDENT_SOURCE_TYPES)[number]

export const ALERT_INCIDENT_KINDS = [
  "issue.new",
  "issue.regressed",
  "issue.escalating",
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const
export type AlertIncidentKind = (typeof ALERT_INCIDENT_KINDS)[number]

export const ALERT_SEVERITIES = ["low", "medium", "high"] as const
export type AlertIncidentSeverity = (typeof ALERT_SEVERITIES)[number]
```

Each kind has exactly one legal source type and one lifecycle flavour, both enforced at the type level by static maps:

| Kind | Source type | Lifecycle | Fires when |
| --- | --- | --- | --- |
| `issue.new` | `issue` | point | An issue is created from a score. |
| `issue.regressed` | `issue` | point | A resolved issue receives a new score. |
| `issue.escalating` | `issue` | sustained | An issue's recent occurrence band exceeds its seasonal baseline. Closes when the band returns or on the 72h timeout. Sensitivity travels on the alert condition. |
| `savedSearch.match` | `savedSearch` | point | A new trace matches the saved search. |
| `savedSearch.threshold` | `savedSearch` | point | The match count crosses a configured threshold (absolute one-time, or multiplier spike). |
| `savedSearch.escalating` | `savedSearch` | sustained | The match count sustains above a configured threshold across (almost) the whole `window`. |

- `ALERT_INCIDENT_KIND_SOURCE_TYPE: Record<AlertIncidentKind, AlertIncidentSourceType>` — the create/update use-cases reject mismatched `(kind, source.type)` pairs before they hit the DB.
- `ALERT_INCIDENT_KIND_LIFECYCLE: Record<AlertIncidentKind, "point" | "sustained">` — drives both the `endedAt` write semantics at incident creation and which notification kinds the pipeline picks (`incident.event` for point, the `incident.opened` + `incident.closed` pair for sustained).
- `USER_CREATABLE_ALERT_KINDS` — the kinds today's product surfaces let users add to a monitor (the three `savedSearch.*` kinds). The data model places no restriction here; the constant exists so the use-cases can reject kinds reserved for system monitors.

### Alert conditions

`AlertIncidentCondition` is a polymorphic discriminated union; the parent alert's `kind` chooses the variant, and kinds with no parameters store `null`. Keeping every variant in one jsonb column avoids schema churn per new kind.

```ts
export type AlertIncidentCondition =
  | AlertIncidentSavedSearchThresholdCondition
  | AlertIncidentSavedSearchEscalatingCondition
  | AlertIncidentIssueEscalatingCondition
```

- **`issue.escalating`** carries `{ sensitivity? }` (1–6, lower = noisier). The seasonal detector's tuning lives WITH the monitor; `undefined` falls back to `DEFAULT_ESCALATION_SENSITIVITY_K`. The system "Issue escalating" monitor is provisioned with that hardcoded default but stays user-tunable from its details panel.
- **`issue.new` / `issue.regressed`** need no parameters → `condition: null`.
- **`savedSearch.match`** has none either (its look-back window and throttle interval are the same hardcoded 5-minute value) → `condition: null`.

Saved-search threshold/escalating conditions carry an `AlertCountThreshold` — the "X times" parameter:

```ts
export type AlertCountThreshold =
  | { mode: "absolute"; count: number }
  | { mode: "multiplier"; factor: number; baseline: AlertBaseline }
  | { mode: "expected"; sensitivity?: number }
```

- **`absolute`** — a fixed match count.
- **`multiplier`** — threshold value = `factor × baseline`, the baseline being a fixed window normalised to the current window's size. The baseline (`AlertBaseline = { kind: "average" | "period"; lookback: AlertDuration }`) is either the rolling average rate over the trailing `lookback` (`average`) or the single equal-length period immediately before now (`period` — `{ days: 1 }` is "yesterday", `{ days: 7 }` "the previous week").
- **`expected`** — compares current activity against the *dynamically learned* expectation for this point in the day/week, via the same seasonal-grid detector (`evaluateSeasonalEscalation`) that powers `issue.escalating`. No fixed window, no `factor`; the single knob is `sensitivity` (the detector's σ-multiplier), surfaced to users as the "N times more than expected" amount.

```ts
export type AlertIncidentSavedSearchThresholdCondition = {
  kind: "savedSearch.threshold"
  threshold: AlertCountThreshold // absolute (one-time) OR multiplier (rearm)
}

export type AlertIncidentSavedSearchEscalatingCondition = {
  kind: "savedSearch.escalating"
  threshold: AlertCountThreshold // absolute, multiplier, or expected (per-bucket)
  window: { minutes: number }    // ≥ 5
}
```

The two `savedSearch.threshold` modes have different rearm semantics but the same notification shape — each firing produces a single point-in-time notification (no separate "closed" notification). `absolute` is a one-time milestone that fires when the cumulative match count since the monitor was created crosses `threshold`, then is durably spent. `multiplier` is a spike detector that compares the last 5 minutes against the normalised baseline and can re-fire on each rising edge.

`savedSearch.escalating`'s `window` is the duration the threshold must stay crossed for before the incident opens — checked by tiling `[now − window, now]` into fixed-size buckets (see the [escalating state machine](#state-machine--savedsearchescalating)). Minimum 5 minutes (the firing throttle interval; a shorter window would be evaluated less often than it claims).

### Monitor entity (`@domain/monitors`)

```ts
export type Monitor = {
  id: MonitorId
  organizationId: OrganizationId
  projectId: ProjectId
  slug: string          // URL-safe, unique per project (soft-delete nulls partition the constraint)
  name: string
  description: string
  system: boolean
  alerts: readonly MonitorAlert[]
  mutedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type MonitorAlert = {
  id: MonitorAlertId
  monitorId: MonitorId
  kind: AlertIncidentKind
  source: { type: AlertIncidentSourceType; id: string | null }
  condition: AlertIncidentCondition | null
  severity: AlertIncidentSeverity
}
```

For system monitors the slug is fixed at provision time and never regenerated since the name is immutable. `source.id = null` means the alert watches all entities of `source.type` in the project. `severity` is independent of kind.

### Postgres schema

Two new tables plus two additive columns on `alert_incidents`. Both tables enable RLS with the org-isolation policy, and follow the no-FK rule — integrity is maintained by cascade logic in the use-cases and the `monitor_alert_id IS NULL` fallback on incidents.

`monitors` carries the entity fields above, with a unique index on `(project_id, slug) WHERE deleted_at IS NULL` and an active-row index on `(organization_id, project_id) WHERE deleted_at IS NULL`.

`monitor_alerts` carries `kind` / `source_type` / `source_id` / `condition` (jsonb) / `severity` plus `deleted_at` for soft-delete. Two indexes:

- `monitor_alerts_monitor_idx (monitor_id)` — **non-partial**: serves both active-alert loads (the query filters `deleted_at IS NULL`) and the `alert_incidents → monitor` join, which must still resolve alerts soft-deleted after firing an incident.
- `monitor_alerts_source_idx (organization_id, source_type, source_id) WHERE deleted_at IS NULL` — the hot path "find ACTIVE alerts watching savedSearch X" for the firing scan; soft-deleted alerts never fire, so they're excluded.

`alert_incidents` gains:

```sql
ALTER TABLE latitude.alert_incidents
  ADD COLUMN monitor_alert_id varchar(24),  -- which specific alert fired (FK-less)
  ADD COLUMN condition        jsonb;        -- snapshot of the firing MonitorAlert.condition

CREATE INDEX alert_incidents_monitor_alert_idx
  ON latitude.alert_incidents (monitor_alert_id) WHERE monitor_alert_id IS NOT NULL;
```

**The owning monitor is NOT denormalised onto `alert_incidents`.** An incident stores only `monitor_alert_id`; the monitor is recovered by joining through `monitor_alerts`. `monitor_alert_id` also gives the saved-search state machines the granularity they need — a single monitor can carry multiple alerts of the same kind on the same source (e.g. two `savedSearch.escalating` alerts with different thresholds), and those machines query "open incident for *this alert*", not "for this monitor".

**Why `monitor_alerts` is soft-deleted, not hard-deleted.** Incidents are historical records that must stay attributable to their monitor forever — including after the firing alert is removed or its source is deleted. Hard-deleting alerts would drop every incident whose alert no longer exists from the monitor's panel. Soft-deleting keeps the join resolvable. Active-alert reads (the monitor's `alerts` list, the firing scan) filter `deleted_at IS NULL`; the incident→monitor join deliberately does **not**, so it still resolves soft-deleted alerts.

#### Write semantics for `monitorAlertId` and `condition`

- **Monitor-driven incidents** (flag on): `monitorAlertId` set to the specific firing alert; `condition` set to a snapshot of that alert's condition (or `null` if the alert had none). The owning monitor is resolved via the join, never stored.
- **Legacy issue-event path** (orgs without the `monitors` flag): `monitorAlertId = null`, `condition = null`. The producer step continues to consult `projects.settings.notifications.incidents` for these rows.

#### Why snapshot `condition` on the incident

A user can edit a monitor mid-incident (bump the threshold, change the window). The already-open incident was opened under the previous condition — both the notification emails and the close-side re-evaluation should use the original. Snapshotting `condition` at creation time makes the row self-describing for the whole notifications pipeline (templates render the humanised "Alert: when matches > 100 in 5 minutes" line) and isolates ongoing incidents from monitor edits. For point-in-time kinds the snapshot is informational; for sustained kinds the close-side worker reads it to know what to re-evaluate against.

#### `entrySignals` polymorphism

The existing `alert_incidents.entrySignals` (jsonb) column already serves `issue.escalating` as the seasonal-signal snapshot used by the close-side comparison. It is **reused** for saved-search incidents rather than adding a new column; the shape varies by kind:

- `issue.escalating`: the seasonal-signal snapshot, as today.
- `savedSearch.escalating`: `{ evaluatedThreshold, baselineCount?, baseline? }`. `baselineCount`/`baseline` are present only for multiplier mode. The frozen `evaluatedThreshold` is what the close-side compares the live count against — the multiplier baseline is *not* re-resolved at close time.
- Other kinds: unused; the column stays `null`.

Per-kind narrowing happens at the read site via a Zod parse, mirroring `payloadSchemaFor(kind)` in `@domain/notifications`.

#### "Did this incident notify anyone?" derivation

This is not stored on `alert_incidents`. Notification rows carry `idempotencyKey` in the format `${notificationKind}:${alertIncidentId}` (`buildIdempotencyKey` in `@domain/notifications`), and the existing `UNIQUE(organization_id, user_id, idempotency_key)` index supports a prefix scan. The "Notified"/"Muted" badge query is:

```sql
SELECT idempotency_key FROM notifications
WHERE organization_id = $org
  AND idempotency_key = ANY(ARRAY['incident.event:<id>', 'incident.opened:<id>', 'incident.closed:<id>'])
LIMIT 1;
```

`EXISTS(any row) ⇒ Notified, else Muted`. No new index is needed (org-level cardinality is bounded); the query is batched across visible incidents in one round-trip.

## Architecture

The same storage shape on `alert_incidents` (polymorphic `entrySignals`, `exitEligibleSince`, backtracked `startedAt`/`endedAt`) powers both paths. The evaluators differ — the seasonal anomaly detector for issues, a count-vs-threshold function for saved searches — and the two paths are deliberately **not** abstracted at the use-case level: forcing one abstraction over ClickHouse seasonal grids and saved-search counts would obscure rather than clarify. They share only the storage shape and trigger plumbing.

### Issue-driven alerts

```
IssueCreated / IssueRegressed / IssueEscalated / IssueEscalationEnded
    │
    ▼  alert-incidents worker (apps/workers/src/workers/domain-events/alert-incidents.ts)
resolveMonitorAlertsForSourceEvent({ orgId, projectId, kind, sourceId })
    │  Returns alerts matching kind + source.type "issue" + (source.id IS NULL OR = sourceId).
    │  Flag off → skip the lookup, write a single legacy incident (monitorAlertId = null);
    │  the project-level gate continues to apply for legacy rows.
    ▼
createAlertIncidentFromIssueEventUseCase  (one row per matching alert)
    │  Each row carries monitorAlertId, condition (snapshot or null), severity (from the
    │  matching alert), startedAt (backtracked for escalating), and the standard issue fields.
    ▼
IncidentCreated outbox event → domain-events worker → notifications:request-incident-notifications
```

**Severity / multiple matches.** If a single issue event matches multiple monitors (e.g. the all-issues system monitor plus a user monitor narrowed to that specific issue id), one incident is written per matching monitor, each carrying its monitor's severity. The notifications pipeline treats them independently — muting one monitor doesn't mute the other.

**Backtracking `startedAt` / `endedAt` for `issue.escalating`.** The seasonal detector flags an escalation only after the band has been crossed for a while, so the event time is a late `startedAt`. `checkIssueEscalationUseCase` (which already holds `ScoreAnalyticsRepository` + `ChSqlClient`) backtracks `startedAt` to the **first** histogram bucket where the occurrence count crossed the seasonal threshold (`backtrackEscalationStart`), walking `histogramByIssues` and `escalationThresholdHistogramByIssues` in lockstep over a 24h / 1h-bucket window. The detector also exits late, so on the organic exit `endedAt` is backtracked symmetrically to the **last** bucket still above the threshold (`backtrackEscalationEnd`, the mirror, scanned newest→oldest). Both timestamps ride the existing `IssueEscalated.startedAt` / `IssueEscalationEnded.endedAt` payloads through to the alert-incidents worker. A **manual** resolve/ignore close keeps `endedAt = now` — the user closed it now, mirroring that the open side never backtracks a manual action. `issue.new` / `issue.regressed` are point-in-time, so `startedAt = endedAt = occurredAt`.

**Escalation sensitivity sourcing.** Sensitivity lives on the monitor. The flag-on detector path resolves the project's system "Issue escalating" monitor alert and reads `sensitivity` from its condition rather than from `projects.settings.escalation.sensitivity`. (Flag-off orgs keep reading project settings on the legacy path.)

### Saved-search alerts

#### Trigger paths

1. **Trace-end-driven, leading-edge throttle.** Trace-end publishes `monitors:checkSavedSearchMonitors` for the org with the queue layer's `leadingThrottleMs` option (`SAVED_SEARCH_MONITORS_THROTTLE_MS`, 5 min). The **first** publish in a window runs **immediately**, then at most one per project per 5 minutes. Leading-edge matters: the trailing evaluation window must still cover the burst that triggered it — a trailing `throttleMs` delay would slide that window 5 minutes past the burst. The handler iterates every active saved-search-source alert and runs the evaluator for each.
2. **Periodic sweep cron, 5-minute interval** (`sweepSavedSearchMonitorsUseCase`, mirrors `sweep-escalating-issues.ts`). Scans all sustained saved-search incidents with `endedAt IS NULL` plus active threshold/match alerts and runs the same handler. This catches closes for low-traffic orgs where no trace-end retriggers the throttled task, and is the safety net for opens. 5 minutes = the minimum escalating `window`; a coarser cadence would delay close transitions.

#### Shared evaluator

`evaluateSavedSearchAlert` (in `@domain/monitors`) is a pure function (modulo IO for trace queries via the `SavedSearchMatchReader` port) returning `{ isMet, count, threshold, firstMatchInWindow, baselineCount? }`. Trace matching is read from ClickHouse through `SavedSearchMatchReader` (`countMatches`, `firstMatchAt`, `lastMatchAt`, `countMatchesPerBucket`), implemented in `@platform/db-clickhouse`.

For **multiplier** mode the two sides must be in the same units. The baseline window is resolved to a concrete `[from, to]` of known length `L` (`average` → `[now − L, now]`; `period` → `[now − 2L, now − L]`), then normalised to the current window: `normalisedBaseline = baselineCount × (currentWindow / baselineLength)`, and `threshold = factor × normalisedBaseline`. This projection is exactly why `average` is "an average" — dividing a window total by its length yields the per-current-window rate. For **expected** mode there is no fixed window: the threshold is the learned expectation for `now`'s day-of-week × hour-of-day from `evaluateSeasonalEscalation`, scaled to the current window and tuned by `sensitivity`; entry signals snapshot the seasonal signals so the close-side re-evaluates against the frozen expectation.

The multiplier snapshot stored at the open transition (`evaluatedThreshold`, `baselineCount`, `baseline`) lets the close-side re-evaluate against the *same* baseline number, preventing the open incident's own elevated counts from drifting a sliding baseline and pinning the incident open.

#### State machine — `savedSearch.match`

The simplest kind — no new state, no prior-incident lookup; the queue's throttle is the entire mechanism. The handler is invoked at most every 5 minutes per project, and on each invocation, if there is ≥1 match in the last 5 minutes, it writes one point-in-time incident (`endedAt = startedAt = firstMatchInWindow`, `condition = null`). Behaviour over time: a simultaneous burst of 500 → 1 alert (redundant publishes coalesced by the throttle); continuous activity over 30 min → 6 alerts; sporadic matches → one alert per 5-min window with ≥1 match. The trade-off versus burst-detection is documented for customers: literal throttle is louder for continuous activity but uses no new state.

#### State machine — `savedSearch.threshold`

**Absolute mode (one-time).** If any `alert_incidents` row exists for this `monitor_alert_id`, short-circuit — the alert is durably spent (re-arm requires removing and re-adding it). Otherwise, if `isMet`, insert a point-in-time incident (`startedAt = firstMatchInWindow ?? now`, `endedAt = startedAt`) and emit `IncidentCreated`. The "any prior incident" check uses `alert_incidents_monitor_alert_idx`; read-then-insert is wrapped in a transaction with `SELECT … FOR UPDATE` on the `monitor_alerts` row to absorb at-least-once retries.

**Multiplier mode (re-fire, silent close).**

```
v    = evaluateSavedSearchAlert(...)
open = alert_incidents WHERE monitor_alert_id = A.id AND endedAt IS NULL

if open is null and v.isMet:          // RISING EDGE — fire
  INSERT incident { startedAt: v.firstMatchInWindow ?? now, endedAt: null,
                    entrySignals: { evaluatedThreshold, baselineCount, baseline } }
  emit IncidentCreated                // single point-in-time notification
else if open is not null and not v.isMet:   // SILENT CLOSE — no notification
  UPDATE incident SET endedAt = now
// else: no-op
```

The absence of an `IncidentClosed` emit is what makes this point-in-time from the user's perspective: one notification at the rising edge, nothing else. The `endedAt = null` window is internal rearm state. The incidents panel renders an open multiplier incident as "Ongoing since X" — the spike is still happening; the alert just doesn't keep nagging.

#### State machine — `savedSearch.escalating`

Sustained. Open via a **bucketed sustained-gate**; close **symmetric and dwell-free**. `run-saved-search-escalating-alert.ts` reads per-bucket match counts over `[now − window, now]` (newest-first, zero-filled, length `N`) plus the live per-bucket threshold.

- **Bucketing.** `bucketMs` = 1 min for `window ≤ 15 min`, else 5 min; `N = floor(window / bucketMs)` buckets aligned to `now`. The per-bucket threshold is the configured threshold sized to one bucket: absolute = `count` per bucket; multiplier = `factor × baseline-rate × bucketMs`; expected = the seasonal σ-band for a bucket-sized window. An empty bucket (count 0) **always fails** — a gap means the breach wasn't sustained.
- **Open.** Open only when **at most `maxFailingBuckets`** buckets fail the *live* per-bucket threshold. `maxFailingBuckets(N)` is `floor(ESCALATING_BUCKET_FAIL_TOLERANCE × N)` with a floor of 1 bucket for any positive tolerance (`ESCALATING_BUCKET_FAIL_TOLERANCE` default `0.1`; `0` = strict). A one-shot spike fills a single bucket and leaves the other `N − 1` failing, so it's filtered by construction.
- **Close.** Symmetric — close once **more than `maxFailingBuckets`** buckets drop below the threshold **frozen at open** (`entrySignals.evaluatedThreshold`; legacy rows fall back to the fresh threshold). The close-side does NOT re-resolve `factor × baseline` or the seasonal band. No dwell: the incident closes roughly `(maxFailingBuckets + 1) × bucketMs` after traffic stops. The same tolerance on close gives anti-flap symmetry — a brief single-bucket dip won't close a noisy-but-sustained breach.
- **Stateless.** Open and close are both pure functions of the current bucketed query. There is no DB column and no migration for escalating state. The `exit_eligible_since` column stays in the schema and is used by `issue.escalating`, but saved-search escalating **ignores** it — a stale value on a legacy open incident has no effect.
- **Backtraced `started_at` AND `ended_at`.** `started_at = SavedSearchMatchReader.firstMatchAt` (the first matching trace in the window, `?? now − window`); on close, `ended_at = SavedSearchMatchReader.lastMatchAt(startedAt, now) ?? now` (the last matching trace of the incident), so the recorded close reflects when traffic actually stopped, not the cadence-delayed detection tick. The `lastMatchAt` lookup runs only on the close transition.
- **No 72h backstop.** Saved-search conditions are deterministic and user-configured; a breach that holds for a week is the system working as designed.

#### Source cascade

When an issue or saved search is deleted, a deletion event routes to `monitors:onSourceDeleted` (`cascadeSourceDeletionUseCase`): it soft-deletes `monitor_alerts` matching `(source_type, source_id)`, and for each affected monitor, if no active alerts remain, soft-deletes the monitor. System monitors are unaffected because their alerts use `source.id = null`.

### Notification payload extension

The `NOTIFICATION_KIND_META` registry (`incident.event` / `incident.opened` / `incident.closed`) is unchanged — the kinds capture the *shape* (one-shot vs sustained), and the templates already render whatever alert kind applies. The only change is on the incident base payload, which gains optional monitor attribution (`monitorId`, `monitorName`, `monitorSlug`, resolved at produce time) and the `condition` snapshot. Templates use these conditionally:

- When `monitorName` is set, email / in-app / Slack templates show a "Created by monitor `<name>`" line; email + Slack deep-link to the monitor details panel via `monitorSlug`.
- When `condition` is set, templates render a humanised summary via the shared `formatHumanReadableAlert` helper.

Incidents created on the legacy path have both absent and fall back to today's copy.

## Web UI

Monitor surfaces follow the repository product pattern: human-facing pages in `apps/web`, route-specific components in the route's `-components/` subfolder, server reads/writes via `createServerFn`. The whole surface is gated by `useHasFeatureFlag("monitors")`.

- **Left navbar** — a `Monitors` item in `ProjectSidebar`, between Issues and Datasets, active on `/monitors`, hidden when the flag is off.
- **Dashboard route** (`.../monitors/index.tsx`) — mirrors the issues dashboard: `ListingLayout` with content + aside, a debounced search input (`query` URL param) and a "+ New monitor" button, and an `InfiniteTable` with offset/limit pagination. Columns: **Name** (system monitors prepend `<LatitudeLogo />`), **Status** (`Live`/`Muted`), **Last incident** ("Closed Xh ago" / "Ongoing since Xh"), and an **Actions** 3-dots menu (Mute/Unmute, plus Rename/Delete for user monitors only). All three data columns are sortable client-side, persisted in `monitorsSort`; default is last-incident descending, with `createdAt` desc then `id` as tiebreaks. System monitors are not pinned. The list read surfaces each monitor's latest-incident timestamp (`MonitorRepository.list` → `lastIncidentByMonitorId`), which both orders the page and populates the column.
- **Details panel** (`.../monitors/-components/monitor-detail-drawer.tsx`) — mirrors `issue-detail-drawer.tsx`. A single read/manage mode: a header block (title, description, copyable slug, a "System" tag for system monitors, a "Muted" badge), a Mute/Unmute right-action, and next/prev nav. Collapsible body sections: **Alerts** (cards rendering `formatHumanReadableAlert` + kind/severity; editing the configurable values saves through `updateMonitorAlertUseCase`, add/remove through `createMonitorAlert` / `deleteMonitorAlert`) and **Incidents** (an embedded `InfiniteTable`, **keyset-paginated** over `(started_at, id)` since incidents are append-heavy and unbounded; backed by the composite incident index). Incident columns: Start time, End time, Source (deep-linked to the issue/saved-search, server-resolved per page; a deleted source falls back to its copyable id), and Notified ("Notified"/"Muted").
- **Create monitor modal** — opened from the dashboard button or the saved-searches dropdown. Fields: name, optional description, and a vertical card stack of alerts. The kind dropdown is limited to `USER_CREATABLE_ALERT_KINDS` (re-validated server-side at submit). Each card has a kind dropdown, a searchable saved-search `Combobox` source picker (no "All saved searches" option — the user must pick one), a conditional condition form, and a severity selector. The threshold/window form expresses `AlertCountThreshold` + (for escalating) `window` in two rows, binding bidirectionally to the discriminated union; "the average of the last 7 days" is the default, and the "expected" option carries an info tooltip explaining the dynamically-learned baseline.
- **Saved-searches integration** — the standalone `/search` page is gone; its UI folds into the `/` page's Sessions/Traces tabs. A `<SavedSearchSelector>` dropdown and a `<SaveOrUpdateSearchButton>` flank the `<SearchInput>` in the actions row. Each saved-search row exposes a delete button and either "Create monitor" (opens the create modal pre-populated with that search) or "Edit monitor" (cross-route navigation to the existing monitor's panel) — the row knows whether a monitor already references this saved search by `source.id`.

### Human-readable alert summaries

`formatHumanReadableAlert(alert)` (in `packages/domain/monitors/src/helpers.ts`) returns one sentence per alert. All sentences start with "Alerts"; saved-search alerts speak of **traces** being **detected** (the saved search humanised by the caller via `context.savedSearchName`). Examples:

| Alert | Output |
| --- | --- |
| `issue.new`, source `all` | "Alerts each time a new issue is detected." |
| `issue.escalating`, source `all` | "Alerts when an ongoing issue is being detected more than expected." |
| `savedSearch.match`, search `"5xx"` | "Alerts each time a new trace matching '5xx' is detected." |
| `savedSearch.threshold`, abs 100 | "Alerts when traces matching '5xx' are detected 100 times." |
| `savedSearch.threshold`, mult 3× avg / 7 days | "Alerts when traces matching '5xx' are detected 3 times more than the average of the last 7 days." |
| `savedSearch.threshold`, expected (sensitivity 2) | "Alerts when traces matching '5xx' are detected 2 times more than expected." |
| `savedSearch.escalating`, abs 2000, window 5m | "Alerts when traces matching '5xx' are detected 2000 times, sustained for at least 5 minutes." |

The helper is shared between the API documentation entity (the sentence appears in OpenAPI examples), the frontend, and notification templates. The short per-kind titles ("Issue discovered", "Search threshold", …) have a single source of truth in `ALERT_INCIDENT_KIND_LABEL` (`@domain/shared`), so the same kind never shows two different names across the panel, incident-chart markers, and notification templates.

## API / SDK / MCP

Monitors are exposed as a public REST surface under `/v1/projects/{projectSlug}/monitors`, with monitor CRUD and monitor-alert CRUD as separate operation families:

| Method | Path | Operation id |
| --- | --- | --- |
| GET / POST | `/` | `listMonitors` / `createMonitor` |
| GET / PATCH / DELETE | `/{monitorSlug}` | `getMonitor` / `updateMonitor` / `deleteMonitor` |
| GET / POST | `/{monitorSlug}/alerts` | `listMonitorAlerts` / `createMonitorAlert` |
| GET / PATCH / DELETE | `/{monitorSlug}/alerts/{alertId}` | `getMonitorAlert` / `updateMonitorAlert` / `deleteMonitorAlert` |
| GET | `/{monitorSlug}/incidents` | `listMonitorIncidents` |
| POST | `/{monitorSlug}/mute`, `/{monitorSlug}/unmute` | `muteMonitor` / `unmuteMonitor` |

- **Alert reads are projections, not a domain read path.** The domain has no separate "read alert" use-case — monitors are always read with their alerts baked in (`getMonitorBySlugUseCase`). `listMonitorAlerts` / `getMonitorAlert` exist only at the API layer for SDK/MCP completeness; each reads the monitor and projects `.alerts` (404 on an `alertId` not present), adding no extra query and no new domain code.
- **Monitor CRUD.** `createMonitor` takes metadata + a non-empty list of alerts and rejects `kind ∉ USER_CREATABLE_ALERT_KINDS`, `system: true`, and saved-search alerts without a `source.id`. `updateMonitor` edits metadata only (name + description) and rejects `system === true`. `deleteMonitor` soft-deletes the monitor and cascades to its alerts; rejects `system`. `mute`/`unmute` are allowed on both modes.
- **Monitor-alert CRUD.** `createMonitorAlert` / `deleteMonitorAlert` add/remove one alert (soft-delete; reject system monitors, enforce the allowlist + `source.id`, can't empty the active list). `updateMonitorAlert` updates an alert's `kind` / `source` / `condition` / `severity` in place. On a **user** monitor the kind may change to another user-creatable kind; on **system** monitors it's the only permitted alert mutation, and only an existing alert's configurable condition values may change — for the system "Issue escalating" monitor this is how `sensitivity` is tuned.

Field descriptions on the OpenAPI schemas are rich enough to render meaningfully as MCP tool descriptions, and the same descriptions propagate to the TS SDK via codegen. Schema and description changes therefore drive the `openapi.json` / `mcp.json` / SDK regeneration (`pnpm openapi:emit`, `pnpm mcp:emit`, `pnpm --filter @latitude-data/sdk generate`).

## Feature flag

Identifier `monitors`, registered in `FEATURE_FLAGS` (`packages/domain/feature-flags/src/registry.ts`). The new path is **additive** — the alert-incidents worker keeps the legacy code path and adds the monitor lookup behind a per-org `hasFeatureFlagUseCase({ identifier: "monitors" })` check:

- **Flag off:** `alert_incidents.monitorAlertId = null`, `condition = null`; the project-level gate (`projects.settings.notifications.incidents`) applies in the producer.
- **Flag on:** the worker resolves matching alerts, writes one incident per alert with `monitorAlertId` + the snapshot condition, and the producer's mute gate applies to monitor-driven incidents.

Frontend: the sidebar nav item is hidden and the `/monitors` route renders a "Not available" splash when the flag is off.

## Provisioning system monitors

Every project gets three system issue monitors. On project creation, the existing `ProjectCreated` → `projects:provision` task calls `provisionSystemMonitorsUseCase(projectId)` after `provisionFlaggers()`. The definitions are hardcoded in `packages/domain/monitors/src/system-monitors.ts`:

| Slug | Name | Alert |
| --- | --- | --- |
| `issue-discovered` | Issue discovered | `issue.new`, source `{ issue, null }`, `condition: null` |
| `issue-regressed` | Issue regressed | `issue.regressed`, source `{ issue, null }`, `condition: null` |
| `issue-escalating` | Issue escalating | `issue.escalating`, source `{ issue, null }`, `condition: { sensitivity: DEFAULT_ESCALATION_SENSITIVITY }` |

Severity is **not** stored on the definition — it's a pure function of `kind` (`SEVERITY_FOR_KIND` in `@domain/shared`: `issue.new` → `medium`, `issue.regressed` / `issue.escalating` → `high`), applied by the provision use-case. This keeps the system monitors and the legacy issue-event path from reporting different severities for the same kind. The use-case is idempotent: on re-run it inserts only missing slugs. The definitions are source-type-agnostic — future system monitors of any source type extend this array. (Existing projects were backfilled once by a self-contained `INSERT … SELECT … WHERE NOT EXISTS` data migration that gave every project all three monitors unmuted; the worker hook covers all projects created since.)

## Mute behaviour

The single seam into the notifications domain is one check in `request-incident-notifications`:

```ts
const incident = yield* alertIncidents.findById(alertIncidentId)
if (incident.monitorAlertId !== null) {
  const monitor = yield* monitors.findByAlertId(incident.monitorAlertId) // joins through the soft-deletable alert
  if (monitor !== null && monitor.mutedAt !== null) {
    return { skipped: "monitor-muted" }
  }
}
// existing logic continues unchanged
```

- Mute does **not** stop incident creation — incidents continue to land in the table and show in the details panel.
- Mute **does** stop notification rows from being created, so the "Notified"/"Muted" badge (driven by `EXISTS(notifications row)`) reads "Muted" for rows opened while muted.
- Toggling mute back on for an open sustained incident has no retroactive effect: the open-time notification was already skipped, and the close-time notification is skipped too if mute is still on at close.
- Resolving the monitor by joining through the (soft-deletable) alert means muting still applies to incidents whose firing alert was later removed.

## Test strategy

Tests follow the repository's layered Vitest approach (see the testing skill). The pure pieces — `formatHumanReadableAlert`, the bucketing/tolerance constants (`maxFailingBuckets`, `countFailingBuckets`), and `evaluateSavedSearchAlert`'s threshold math — have unit tests covering the full alert matrix. The state machines (`run-saved-search-{match,threshold,escalating}-alert`) and the issue-event path (`resolve-monitor-alerts-for-source-event`, incident open/close) are tested against the PGlite/chdb testkit with a fake `SavedSearchMatchReader`, exercising rising/falling edges, the absolute one-time short-circuit, the multiplier silent close, and the escalating sustained-gate open + dwell-free close. The use-case suites cover the structural-lock and user-creatable-allowlist rejections, the source cascade (soft-delete + monitor emptying), provisioning idempotency, and the mute gate in `request-incident-notifications`.

## See also

- Design spec: `specs/monitors.md` (decisions, trade-offs, rollout history).
- [notifications.md](./notifications.md) — the incident → notification pipeline monitors feed into.
- [issues.md](./issues.md) and [reliability.md](./reliability.md) — the issue lifecycle and seasonal detector behind the `issue.*` kinds.
- Skills: `.agents/skills/async-jobs-and-events/SKILL.md` (queues/throttles), `.agents/skills/database-postgres/SKILL.md` (no-FK + RLS), `.agents/skills/database-clickhouse/SKILL.md` (the match reader queries).
