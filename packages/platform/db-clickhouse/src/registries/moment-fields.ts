import type { ChFieldRegistry } from "../filter-builder.ts"

/**
 * Moment-specific field registry for WHERE clauses over the `session_moment_labels`
 * table. Exposed as `moment.*` filter keys in the analytics FilterSet. Columns are
 * qualified with the `lbl` alias since the moments inner query joins the labels
 * table to `session_semantic_moments` (both carry `session_id`).
 */
export const MOMENT_FIELD_REGISTRY: ChFieldRegistry = {
  "moment.kind": { column: "lbl.kind", chType: "String" },
  "moment.actor": { column: "lbl.actor", chType: "String" },
  "moment.session": { column: "lbl.session_id", chType: "String" },
  "moment.confidence": { column: "lbl.confidence", chType: "Float32" },
}
