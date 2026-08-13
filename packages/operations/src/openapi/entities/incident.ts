import {
  ALERT_SEVERITIES,
  INCIDENT_SOURCE_TYPES as INCIDENT_SOURCE_TYPE_VALUES,
  type Incident,
} from "@domain/incidents"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

export const INCIDENT_SOURCE_TYPES = INCIDENT_SOURCE_TYPE_VALUES
export const INCIDENT_SEVERITIES = ALERT_SEVERITIES

// --- Alert condition schemas ------------------------------------------------
//
// The condition is a kind-discriminated union of nested unions. Each level is
// registered as a named `.openapi(...)` component so Fern emits reusable SDK
// types instead of inlining anonymous shapes (the same requirement that drives
// `FilterSet` / `TraceRef` in `../schemas.ts`). Defined here — the lowest-level
// entity that references it — so both `Incident` (the frozen snapshot) and
// `Monitor` live config can share the one component without a cycle.

const AlertDurationSchema = z
  .discriminatedUnion("unit", [
    z.object({
      unit: z.literal("minutes").describe("The duration is expressed in whole minutes; read `minutes`."),
      minutes: z.number().positive().describe("Number of minutes."),
    }),
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

const MonitorMetricSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("count").describe("Count matching events in each evaluation bucket.") }),
    z.object({ kind: z.literal("errorRate").describe("Measure the fraction of matching events that errored.") }),
    z.object({
      kind: z
        .literal("cacheHitRate")
        .describe(
          "Token-weighted prompt-cache hit rate (cache-read tokens over total input-side tokens), a 0..1 fraction.",
        ),
    }),
    z.object({
      kind: z.literal("avg").describe("Average a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("sum").describe("Sum a numeric field over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("min").describe("Find the minimum numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("max").describe("Find the maximum numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
    z.object({
      kind: z.literal("median").describe("Find the median numeric field value over matching events."),
      field: z.enum(["duration", "cost", "tokens"]).describe("Numeric field to aggregate."),
    }),
  ])
  .openapi("MonitorMetric")

const AlertMetricThresholdSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("absolute").describe("Compare the metric against a fixed value; read `value`."),
      value: z.number().positive().describe("Metric value that opens the incident."),
    }),
    z.object({
      mode: z
        .literal("multiplier")
        .describe("Compare the metric rate against `factor × baseline`; read `factor` and `baseline`."),
      factor: z.number().positive().describe("Multiple of the baseline rate that opens the incident (e.g. `3` = 3×)."),
      baseline: AlertBaselineSchema.describe("Fixed-window baseline the current rate is compared against."),
    }),
    z.object({
      mode: z
        .literal("expected")
        .describe("Compare against the seasonally-learned expected value for this time of day/week."),
      sensitivity: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Detector sensitivity from 1 (noisiest) to 6 (strictest). Defaults to 3 when omitted."),
    }),
  ])
  .openapi("AlertMetricThreshold")

export const AlertThresholdConditionSchema = z
  .object({
    trigger: z.literal("threshold").describe("Opens once the measured value crosses the threshold."),
    metric: MonitorMetricSchema.describe("Metric measured over the monitor target."),
    threshold: AlertMetricThresholdSchema.describe("How the metric is compared."),
    direction: z
      .enum(["above", "below"])
      .optional()
      .describe("Direction that opens the incident. Defaults to `above` when omitted."),
  })
  .openapi("AlertThresholdCondition")

export const AlertEscalatingConditionSchema = z
  .object({
    trigger: z.literal("escalating").describe("Opens when the monitor target is escalating or sustained."),
    metric: MonitorMetricSchema.describe("Metric measured over the monitor target."),
    threshold: AlertMetricThresholdSchema.optional().describe("How the metric is compared when threshold-based."),
    direction: z
      .enum(["above", "below"])
      .optional()
      .describe("Direction that opens the incident. Defaults to `above` when omitted."),
    sensitivity: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe("Detector sensitivity from 1 (noisiest) to 6 (strictest). Defaults to 3 when omitted."),
    window: z
      .object({
        minutes: z
          .number()
          .int()
          .min(5)
          .describe("How long the threshold must stay crossed before the incident opens. Minimum 5."),
      })
      .describe("Sustained-condition window."),
  })
  .openapi("AlertEscalatingCondition")

export const AlertConditionSchema = z
  .discriminatedUnion("trigger", [AlertThresholdConditionSchema, AlertEscalatingConditionSchema])
  .openapi("AlertCondition")

const IncidentConditionSchema = z.union([AlertConditionSchema, z.null()])

export const incidentFields = {
  id: cuidSchema.describe("Stable incident identifier."),
  organizationId: cuidSchema.describe("Organization that owns this incident."),
  projectId: cuidSchema.describe("Project this incident belongs to."),
  sourceType: z
    .enum(INCIDENT_SOURCE_TYPES)
    .describe("Kind of entity that triggered the incident: `signal` or `monitor`."),
  sourceId: cuidSchema.describe("Id of the entity that triggered the incident (matches `sourceType`)."),
  severity: z
    .enum(INCIDENT_SEVERITIES)
    .describe("Severity bucket assigned to the incident: `low`, `medium`, `high`, or `urgent`."),
  startedAt: z.string().describe("ISO-8601 timestamp at which the incident opened."),
  endedAt: z.string().nullable().describe("ISO-8601 timestamp at which the incident closed, or `null` if still open."),
  createdAt: z.string().describe("ISO-8601 timestamp at which the incident row was created."),
  condition: IncidentConditionSchema.describe(
    "The monitor rule configuration when the incident opened, or `null` for signal incidents and match monitors.",
  ),
} as const

export const IncidentSchema = z.object(incidentFields).openapi("Incident")

export const toIncidentResponse = (incident: Incident) => ({
  id: incident.id as string,
  organizationId: incident.organizationId as string,
  projectId: incident.projectId as string,
  sourceType: incident.sourceType,
  sourceId: incident.sourceId,
  severity: incident.severity,
  startedAt: incident.startedAt.toISOString(),
  endedAt: incident.endedAt ? incident.endedAt.toISOString() : null,
  createdAt: incident.createdAt.toISOString(),
  // Published condition schema is a subset of the domain type (no percentile metric); pass through as-is.
  condition: incident.condition as z.infer<typeof IncidentConditionSchema>,
})
