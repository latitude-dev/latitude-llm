import type { TRACE_FILTER_FIELDS } from "@domain/shared"

type MultiSelectField = Extract<(typeof TRACE_FILTER_FIELDS)[number], { type: "multiSelect" }>
export type DistinctColumn = MultiSelectField["field"]
