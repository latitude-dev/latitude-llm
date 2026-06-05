import type { TRACE_FILTER_FIELDS } from "@domain/shared"

type MultiSelectField = Extract<(typeof TRACE_FILTER_FIELDS)[number], { type: "multiSelect" }>
/** Session-only fields use static option lists, not distinct-value queries. */
export type DistinctColumn = Exclude<MultiSelectField, { sessionOnly: true }>["field"]
