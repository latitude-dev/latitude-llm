import type { ChFieldRegistry } from "../filter-builder.ts"

/**
 * Score-specific field registry used to build WHERE clauses over the
 * ClickHouse `scores` analytics table when computing per-trace or
 * per-session score rollups.
 *
 * These fields are exposed as `score.*` filter keys in the shared
 * FilterSet when filtering traces/sessions by score-derived properties.
 */
export const SCORE_FIELD_REGISTRY: ChFieldRegistry = {
  "score.passed": { column: "passed", chType: "Bool" },
  "score.errored": { column: "errored", chType: "Bool" },
  "score.value": { column: "value", chType: "Float32" },
  "score.source": { column: "source", chType: "FixedString(32)" },
  "score.sourceId": { column: "source_id", chType: "FixedString(128)" },
  "score.issueId": { column: "issue_id", chType: "FixedString(24)" },
  "score.simulationId": { column: "simulation_id", chType: "FixedString(24)" },
}

/**
 * Fields that are recognized as score-scoped filter keys.
 * Used to split a FilterSet into telemetry filters vs score filters.
 */
export const SCORE_FILTER_KEYS = new Set(Object.keys(SCORE_FIELD_REGISTRY))

/**
 * Checks whether a filter key is a score-scoped filter.
 */
export const isScoreFilterKey = (key: string): boolean => SCORE_FILTER_KEYS.has(key)
