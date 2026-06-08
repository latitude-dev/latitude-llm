import { ALERT_INCIDENT_KINDS, ALERT_INCIDENT_SOURCE_TYPES, ALERT_SEVERITIES, type AlertIncident } from "@domain/alerts"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

export const INCIDENT_KINDS = ALERT_INCIDENT_KINDS
export const INCIDENT_SOURCE_TYPES = ALERT_INCIDENT_SOURCE_TYPES
export const INCIDENT_SEVERITIES = ALERT_SEVERITIES

// --- Alert condition schemas ------------------------------------------------
//
// The condition is a kind-discriminated union of nested unions. Each level is
// registered as a named `.openapi(...)` component so Fern emits reusable SDK
// types instead of inlining anonymous shapes (the same requirement that drives
// `FilterSet` / `TraceRef` in `../schemas.ts`). Defined here — the lowest-level
// entity that references it — so both `Incident` (the frozen snapshot) and
// `MonitorAlert` (the live config) can share the one component without a cycle.

const AlertDurationSchema = z
  .discriminatedUnion("unit", [
    z.object({
      unit: z.literal("hours").describe("The duration is expressed in whole hours; read `hours`."),
      hours: z.number().positive().describe("Number of hours."),
    }),
    z.object({
      unit: z.literal("days").describe("The duration is expressed in whole days; read `days`."),
      days: z.number().positive().describe("Number of days."),
    }),
  ])
  .openapi("AlertDuration")

const AlertBaselineSchema = z
  .object({
    kind: z
      .enum(["average", "period"])
      .describe(
        "How the comparison rate is computed. `average` is the rolling rate over the last `lookback`; `period` is the equal-length window immediately before it (e.g. `lookback` of 1 day compares against yesterday) for daily/weekly seasonality.",
      ),
    lookback: AlertDurationSchema.describe("Length of the window used to compute the baseline rate."),
  })
  .openapi("AlertBaseline")

const AlertCountThresholdSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("absolute").describe("Compare the match count against a fixed number; read `count`."),
      count: z.number().int().positive().describe("Number of matching traces that opens the incident."),
    }),
    z.object({
      mode: z
        .literal("multiplier")
        .describe("Compare the match rate against `factor × baseline`; read `factor` and `baseline`."),
      factor: z.number().positive().describe("Multiple of the baseline rate that opens the incident (e.g. `3` = 3×)."),
      baseline: AlertBaselineSchema.describe("Fixed-window baseline the current rate is compared against."),
    }),
    z.object({
      mode: z
        .literal("expected")
        .describe(
          "Compare against the seasonally-learned expected rate for this time of day/week (the same detector as automatic issue escalation); the only knob is `sensitivity`.",
        ),
      sensitivity: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Detector sensitivity from 1 (noisiest) to 6 (strictest). Defaults to 3 when omitted."),
    }),
  ])
  .openapi("AlertCountThreshold")

export const AlertConditionSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("savedSearch.threshold").describe("Threshold alert: opens once the count threshold is crossed."),
      threshold: AlertCountThresholdSchema.describe("How the match count/rate is compared."),
    }),
    z.object({
      kind: z
        .literal("savedSearch.escalating")
        .describe("Sustained alert: opens only when the threshold stays crossed for the whole `window`."),
      threshold: AlertCountThresholdSchema.describe("How the match count/rate is compared."),
      window: z
        .object({
          minutes: z
            .number()
            .int()
            .min(5)
            .describe(
              "How long the threshold must stay crossed before the incident opens. The incident stays open while the threshold keeps holding over this window and closes once it no longer does. Minimum 5.",
            ),
        })
        .describe("Sustained-condition window."),
    }),
    z.object({
      kind: z.literal("issue.escalating").describe("System issue-escalation alert; only `sensitivity` is tunable."),
      sensitivity: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Detector sensitivity from 1 (noisiest) to 6 (strictest). Defaults to 3 when omitted."),
    }),
  ])
  .openapi("AlertCondition")

export const incidentFields = {
  id: cuidSchema.describe("Stable incident identifier."),
  organizationId: cuidSchema.describe("Organization that owns this incident."),
  projectId: cuidSchema.describe("Project this incident belongs to."),
  sourceType: z
    .enum(INCIDENT_SOURCE_TYPES)
    .describe(
      "Kind of entity that triggered the incident. `issue` for issue-lifecycle incidents; `savedSearch` for incidents raised by a monitor watching a search.",
    ),
  sourceId: cuidSchema.describe("Id of the entity that triggered the incident (matches `sourceType`)."),
  kind: z
    .enum(INCIDENT_KINDS)
    .describe(
      "Reason the incident opened. `issue.new` fires when a new issue is discovered; `issue.regressed` when a resolved issue is detected again; `issue.escalating` when an ongoing issue is being detected more than expected. The `savedSearch.*` kinds are raised by monitors watching a search: `savedSearch.match` on each new matching trace, `savedSearch.threshold` when matching traces are detected above a configured threshold, and `savedSearch.escalating` when they stay above the threshold for a sustained window.",
    ),
  severity: z
    .enum(INCIDENT_SEVERITIES)
    .describe("Severity bucket assigned to the incident: `low`, `medium`, or `high`."),
  startedAt: z.string().describe("ISO-8601 timestamp at which the incident opened."),
  endedAt: z.string().nullable().describe("ISO-8601 timestamp at which the incident closed, or `null` if still open."),
  createdAt: z.string().describe("ISO-8601 timestamp at which the incident row was created."),
  monitorAlertId: cuidSchema
    .nullable()
    .describe("Id of the monitor alert that opened this incident, or `null` when not attributed to a monitor."),
  condition: AlertConditionSchema.nullable().describe(
    "The alert's configuration when the incident opened, or `null` for kinds with no parameters.",
  ),
} as const

export const IncidentSchema = z.object(incidentFields).openapi("Incident")

export const toIncidentResponse = (incident: AlertIncident) => ({
  id: incident.id as string,
  organizationId: incident.organizationId as string,
  projectId: incident.projectId as string,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  kind: incident.kind,
  severity: incident.severity,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt ? incident.endedAt.toISOString() : null,
  createdAt: incident.createdAt.toISOString(),
  monitorAlertId: incident.monitorAlertId as string | null,
  condition: incident.condition,
})
