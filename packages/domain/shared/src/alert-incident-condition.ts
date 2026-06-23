import { z } from "zod"
import { monitorTriggerSchema } from "./alert-incident-kinds.ts"
import { filterSetSchema } from "./filter.ts"

export const alertDurationSchema = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("minutes"), minutes: z.number().positive() }),
  z.object({ unit: z.literal("hours"), hours: z.number().positive() }),
  z.object({ unit: z.literal("days"), days: z.number().positive() }),
])
export type AlertDuration = z.infer<typeof alertDurationSchema>

export const escalationSensitivitySchema = z.number().int().min(1).max(6)
export const DEFAULT_ESCALATION_SENSITIVITY = 3

export const alertBaselineSchema = z.object({
  kind: z.enum(["average", "period"]),
  lookback: alertDurationSchema,
})
export type AlertBaseline = z.infer<typeof alertBaselineSchema>

export const alertCountThresholdSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("absolute"), count: z.number().int().positive() }),
  z.object({ mode: z.literal("multiplier"), factor: z.number().positive(), baseline: alertBaselineSchema }),
  z.object({ mode: z.literal("expected"), sensitivity: escalationSensitivitySchema.optional() }),
])
export type AlertCountThreshold = z.infer<typeof alertCountThresholdSchema>

export const MONITOR_METRIC_KINDS = ["count", "errorRate", "sum", "min", "max", "avg", "median"] as const
export const monitorMetricKindSchema = z.enum(MONITOR_METRIC_KINDS)
export type MonitorMetricKind = z.infer<typeof monitorMetricKindSchema>

export const MONITOR_METRIC_FIELDS = ["duration", "cost", "tokens"] as const
export const monitorMetricFieldSchema = z.enum(MONITOR_METRIC_FIELDS)
export type MonitorMetricField = z.infer<typeof monitorMetricFieldSchema>

export const monitorMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("errorRate") }),
  z.object({ kind: z.literal("sum"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("min"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("max"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("avg"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("median"), field: monitorMetricFieldSchema }),
])
export type MonitorMetric = z.infer<typeof monitorMetricSchema>

export const alertMetricThresholdDirectionSchema = z.enum(["above", "below"])
export type AlertMetricThresholdDirection = z.infer<typeof alertMetricThresholdDirectionSchema>

export const alertMetricThresholdSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("absolute"),
    value: z.number().positive(),
  }),
  z.object({ mode: z.literal("multiplier"), factor: z.number().positive(), baseline: alertBaselineSchema }),
  z.object({ mode: z.literal("expected"), sensitivity: escalationSensitivitySchema.optional() }),
])
export type AlertMetricThreshold = z.infer<typeof alertMetricThresholdSchema>

export const alertIncidentThresholdConditionSchema = z.object({
  trigger: z.literal("threshold"),
  metric: monitorMetricSchema,
  threshold: alertMetricThresholdSchema,
  direction: alertMetricThresholdDirectionSchema.optional(),
})
export type AlertIncidentThresholdCondition = z.infer<typeof alertIncidentThresholdConditionSchema>

export const alertIncidentEscalatingConditionSchema = z.object({
  trigger: z.literal("escalating"),
  metric: monitorMetricSchema,
  threshold: alertMetricThresholdSchema.optional(),
  direction: alertMetricThresholdDirectionSchema.optional(),
  sensitivity: escalationSensitivitySchema.optional(),
  window: z.object({ minutes: z.number().int().min(5) }).optional(),
})
export type AlertIncidentEscalatingCondition = z.infer<typeof alertIncidentEscalatingConditionSchema>

export const alertIncidentConditionSchema = z.discriminatedUnion("trigger", [
  alertIncidentThresholdConditionSchema,
  alertIncidentEscalatingConditionSchema,
])
export type AlertIncidentCondition = z.infer<typeof alertIncidentConditionSchema>

export const monitorConfigSchema = z.object({
  filterSet: filterSetSchema.optional(),
  metric: monitorMetricSchema.optional(),
  condition: alertIncidentConditionSchema.optional(),
})
export type MonitorConfig = z.infer<typeof monitorConfigSchema>

export const conditionTrigger = (condition: AlertIncidentCondition | null | undefined) =>
  condition?.trigger ?? monitorTriggerSchema.enum.match
