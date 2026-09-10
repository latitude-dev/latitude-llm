import { z } from "zod"
import {
  costAggregationModeSchema,
  costFamilySchema,
  costRawUnitSchema,
  isCostRawUnitOfFamily,
  unitFractionSchema,
} from "./cost-evidence.ts"

export const costApplicabilityRequirementSchema = z.enum([
  "pricedUsageSpan",
  "cacheEligibleCalls",
  "capturedGenerationContent",
  "readableModelContextLimit",
  "comparableToolCalls",
  "capturedToolCallStructure",
  "completeDefinitionObservationPeriod",
  "capturedMemoryReads",
  "capturedMemoryWriteHashes",
  "readableRecordHistory",
  "readableCompletionChronology",
])
export type CostApplicabilityRequirement = z.infer<typeof costApplicabilityRequirementSchema>

export const costApplicabilityRuleSchema = z
  .object({
    requirements: z.array(costApplicabilityRequirementSchema).min(1),
    minimumComparableUnits: z.number().int().positive().optional(),
    description: z.string().min(1),
  })
  .superRefine((rule, ctx) => {
    if (new Set(rule.requirements).size !== rule.requirements.length) {
      ctx.addIssue({ code: "custom", path: ["requirements"], message: "requirements must be unique" })
    }
    const comparesUnits = rule.requirements.includes("comparableToolCalls")
    if (comparesUnits && rule.minimumComparableUnits === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumComparableUnits"],
        message: "a comparison rule must state how many comparable units it needs",
      })
    }
    if (!comparesUnits && rule.minimumComparableUnits !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumComparableUnits"],
        message: "only a comparison rule can require a minimum unit count",
      })
    }
  })
export type CostApplicabilityRule = z.infer<typeof costApplicabilityRuleSchema>

export const costProductDestinationSchema = z.enum([
  "cost",
  "tools",
  "memory",
  "sessions",
  "signals",
  "sessionAssessment",
])
export type CostProductDestination = z.infer<typeof costProductDestinationSchema>

export const costMetricCatalogEntrySchema = z
  .object({
    metricId: z.string().min(1),
    family: costFamilySchema,
    rawUnit: costRawUnitSchema,
    aggregation: costAggregationModeSchema,
    readerId: z.string().min(1),
    curveId: z.string().min(1),
    overlapGroup: z.string().min(1),
    applicability: costApplicabilityRuleSchema,
    coverageFloor: unitFractionSchema,
    destinations: z.array(costProductDestinationSchema).min(1),
  })
  .superRefine((entry, ctx) => {
    if (!isCostRawUnitOfFamily({ family: entry.family, rawUnit: entry.rawUnit })) {
      ctx.addIssue({ code: "custom", path: ["rawUnit"], message: "raw unit does not belong to the Cost family" })
    }
    if (new Set(entry.destinations).size !== entry.destinations.length) {
      ctx.addIssue({ code: "custom", path: ["destinations"], message: "destinations must be unique" })
    }
  })
export type CostMetricCatalogEntry = z.infer<typeof costMetricCatalogEntrySchema>

export const costMetricCatalogSchema = z
  .object({
    catalogVersion: z.string().min(1),
    calibration: z.enum(["provisional", "calibrated"]),
    entries: z.array(costMetricCatalogEntrySchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    const metricIds = new Set(catalog.entries.map((entry) => entry.metricId))
    if (metricIds.size !== catalog.entries.length) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "metric ids must be unique" })
    }
  })
export type CostMetricCatalog = z.infer<typeof costMetricCatalogSchema>

// One uniform placeholder until shadow calibration sets a real per-metric readable-share floor.
export const PROVISIONAL_METRIC_COVERAGE_FLOOR = 0.5

const spendCatalogEntries = [
  {
    metricId: "cost.recoverable_spend_share",
    family: "spend",
    rawUnit: "microcents",
    aggregation: "resourceRatio",
    readerId: "cost.attributable_spend",
    curveId: "cost.recoverable_spend_share",
    overlapGroup: "spend.attributable-generations",
    applicability: {
      requirements: ["pricedUsageSpan"],
      description: "At least one priced usage span.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "sessions", "sessionAssessment"],
  },
] satisfies readonly CostMetricCatalogEntry[]

const contextCatalogEntries = [
  {
    metricId: "cost.cache_gap",
    family: "context",
    rawUnit: "cacheTokens",
    aggregation: "resourceRatio",
    readerId: "cost.cache_gap",
    curveId: "cost.cache_gap",
    overlapGroup: "context.cache-tokens",
    applicability: {
      requirements: ["cacheEligibleCalls"],
      description: "Cache-eligible calls pass the reader's evidence guards.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "sessions", "sessionAssessment"],
  },
  {
    metricId: "context.redundant_input_share",
    family: "context",
    rawUnit: "inputTokens",
    aggregation: "resourceRatio",
    readerId: "context.content_atoms",
    curveId: "context.redundant_input_share",
    overlapGroup: "context.redundant-atoms",
    applicability: {
      requirements: ["capturedGenerationContent"],
      description: "Generation content is captured.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "sessions", "sessionAssessment"],
  },
  {
    metricId: "context.avoidable_pressure",
    family: "context",
    rawUnit: "contextLimitTokens",
    aggregation: "sessionMean",
    readerId: "context.content_atoms",
    curveId: "context.avoidable_pressure",
    overlapGroup: "context.redundant-atoms",
    applicability: {
      requirements: ["capturedGenerationContent", "readableModelContextLimit"],
      description: "Generation content and the model context limit are readable.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "sessions", "sessionAssessment"],
  },
  {
    metricId: "tools.dead_surface",
    family: "context",
    rawUnit: "inputTokens",
    aggregation: "resourceRatio",
    readerId: "tools.definition_surface",
    curveId: "tools.dead_surface",
    overlapGroup: "context.tool-definitions",
    applicability: {
      requirements: ["completeDefinitionObservationPeriod", "capturedGenerationContent"],
      description: "The definition observation period is complete and model inputs are captured.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "tools", "sessionAssessment"],
  },
] satisfies readonly CostMetricCatalogEntry[]

const toolCatalogEntries = [
  {
    metricId: "tools.repeated_call",
    family: "tools",
    rawUnit: "toolCalls",
    aggregation: "eventRate",
    readerId: "tools.repetition",
    curveId: "tools.repeated_call",
    overlapGroup: "tools.repeated-calls",
    applicability: {
      requirements: ["comparableToolCalls"],
      minimumComparableUnits: 2,
      description: "At least two comparable tool calls with captured input and output.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "tools", "sessions", "sessionAssessment"],
  },
  {
    metricId: "tools.thrashing",
    family: "tools",
    rawUnit: "toolCalls",
    aggregation: "eventRate",
    readerId: "tools.thrashing",
    curveId: "tools.thrashing",
    overlapGroup: "tools.repeated-calls",
    applicability: {
      requirements: ["comparableToolCalls"],
      minimumComparableUnits: 3,
      description: "At least three comparable tool calls with captured input and output.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "tools", "sessions", "signals", "sessionAssessment"],
  },
  {
    metricId: "tools.structural_defect",
    family: "tools",
    rawUnit: "toolCalls",
    aggregation: "eventRate",
    readerId: "tools.call_and_structure",
    curveId: "tools.structural_defect",
    overlapGroup: "tools.malformed-interactions",
    applicability: {
      requirements: ["capturedToolCallStructure"],
      description: "The complete tool call and result structure is captured.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "tools", "sessions", "signals", "sessionAssessment"],
  },
] satisfies readonly CostMetricCatalogEntry[]

const memoryCatalogEntries = [
  {
    metricId: "memory.repeated_zero_hit",
    family: "memory",
    rawUnit: "memoryReads",
    aggregation: "eventRate",
    readerId: "memory.reads",
    curveId: "memory.repeated_zero_hit",
    overlapGroup: "memory.reads",
    applicability: {
      requirements: ["capturedMemoryReads"],
      description: "Memory reads and their result counts are captured.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "memory", "sessions", "sessionAssessment"],
  },
  {
    metricId: "memory.noop_rewrite",
    family: "memory",
    rawUnit: "memoryWrites",
    aggregation: "eventRate",
    readerId: "memory.writes",
    curveId: "memory.noop_rewrite",
    overlapGroup: "memory.writes",
    applicability: {
      requirements: ["capturedMemoryWriteHashes"],
      description: "Current and previous content hashes are non-empty.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "memory", "sessions", "sessionAssessment"],
  },
  {
    metricId: "memory.reverted_write",
    family: "memory",
    rawUnit: "memoryWrites",
    aggregation: "eventRate",
    readerId: "memory.writes",
    curveId: "memory.reverted_write",
    overlapGroup: "memory.writes",
    applicability: {
      requirements: ["capturedMemoryWriteHashes", "readableRecordHistory"],
      description: "Same-session record history is readable.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "memory", "sessions", "sessionAssessment"],
  },
] satisfies readonly CostMetricCatalogEntry[]

const recoveryCatalogEntries = [
  {
    metricId: "recovery.recovered_incident_rate",
    family: "recovery",
    rawUnit: "completedSessions",
    aggregation: "eventRate",
    readerId: "recovery.incidents",
    curveId: "recovery.recovered_incident_rate",
    overlapGroup: "recovery.incidents",
    applicability: {
      requirements: ["readableCompletionChronology"],
      description: "Completion and incident chronology are readable.",
    },
    coverageFloor: PROVISIONAL_METRIC_COVERAGE_FLOOR,
    destinations: ["cost", "sessions", "sessionAssessment"],
  },
] satisfies readonly CostMetricCatalogEntry[]

export const PROVISIONAL_COST_METRIC_CATALOG = {
  catalogVersion: "cost-launch-catalog-provisional",
  calibration: "provisional",
  entries: [
    ...spendCatalogEntries,
    ...contextCatalogEntries,
    ...toolCatalogEntries,
    ...memoryCatalogEntries,
    ...recoveryCatalogEntries,
  ],
} satisfies CostMetricCatalog
