import {
  buildMultiSelectArrayFilter,
  type FilterSet,
  getMultiSelectArrayFilter,
  MULTI_SELECT_ARRAY_OP_LABELS,
  MULTI_SELECT_ARRAY_OPS,
  type MultiSelectArrayOp,
} from "@domain/shared"
import { Select } from "@repo/ui"
import type { RefObject } from "react"
import { type FilterMode, MultiSelectFilter } from "./multi-select-filter.tsx"
import type { DistinctColumn } from "./types.ts"

interface MultiSelectFilterSectionProps {
  readonly mode?: FilterMode
  readonly projectId: string
  readonly field: DistinctColumn
  readonly filters: FilterSet
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly disabled?: boolean
  readonly portalContainer?: RefObject<HTMLElement | null>
}

const OPERATOR_OPTIONS = MULTI_SELECT_ARRAY_OPS.map((op) => ({
  value: op,
  label: MULTI_SELECT_ARRAY_OP_LABELS[op],
}))

function setMultiSelectField(
  filters: FilterSet,
  field: string,
  op: MultiSelectArrayOp,
  values: readonly string[],
): FilterSet {
  const conditions = buildMultiSelectArrayFilter(op, values)
  if (conditions.length === 0) {
    const { [field]: _, ...rest } = filters
    return rest
  }
  return { ...filters, [field]: conditions }
}

export function MultiSelectFilterSection({
  mode = "traces",
  projectId,
  field,
  filters,
  onFiltersChange,
  disabled,
  portalContainer,
}: MultiSelectFilterSectionProps) {
  const { op, values } = getMultiSelectArrayFilter(filters, field)

  return (
    <div className="flex flex-col gap-2">
      <Select<MultiSelectArrayOp>
        name={`${field}-operator`}
        size="small"
        width="full"
        options={OPERATOR_OPTIONS}
        value={op}
        {...(disabled !== undefined ? { disabled } : {})}
        onChange={(nextOp) => {
          onFiltersChange(setMultiSelectField(filters, field, nextOp, values))
        }}
      />
      <MultiSelectFilter
        mode={mode}
        projectId={projectId}
        column={field}
        selected={values}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(portalContainer !== undefined ? { portalContainer } : {})}
        onChange={(nextValues) => {
          onFiltersChange(setMultiSelectField(filters, field, op, nextValues))
        }}
      />
    </div>
  )
}
