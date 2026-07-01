import type { ChFieldRegistry } from "../filter-builder.ts"

/**
 * Behavior-specific field registry for WHERE clauses over the `taxonomy_observations`
 * table. Exposed as `behavior.*` filter keys in the analytics FilterSet.
 */
export const BEHAVIOR_FIELD_REGISTRY: ChFieldRegistry = {
  "behavior.cluster": { column: "assigned_cluster_id", chType: "String" },
  "behavior.session": { column: "session_id", chType: "String" },
  "behavior.method": { column: "assignment_method", chType: "String" },
  "behavior.confidence": { column: "assignment_confidence", chType: "Float32" },
}
