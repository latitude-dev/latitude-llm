import {
  buildMultiSelectArrayFilter,
  type FilterSet,
  getMultiSelectArrayFilter,
  MULTI_SELECT_ARRAY_OP_LABELS,
  MULTI_SELECT_ARRAY_OPS,
  MULTI_SELECT_ARRAY_OP_TAB_LABELS,
  type MultiSelectArrayOp,
} from "@domain/shared"
import { Tabs } from "@repo/ui"
import type { RefObject } from "react"
import {
  type FilterMode,
  MultiSelectFilter,
  type StaticFilterItem,
} from "./multi-select-filter.tsx"
import type { DistinctColumn } from "./types.ts"

interface MultiSelectFilterSectionProps {
  readonly mode?: FilterMode
  readonly projectId: string
  readonly field: DistinctColumn
  readonly filters: FilterSet
  readonly onFiltersChange: (filters: FilterSet) => void
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly portalContainer?: RefObject<HTMLElement | null>
  readonly staticItems?: readonly StaticFilterItem[]
}

const OPERATOR_TABS = MULTI_SELECT_ARRAY_OPS.map((op) => ({
  id: op,
  label: MULTI_SELECT_ARRAY_OP_TAB_LABELS[op],
  tooltip: MULTI_SELECT_ARRAY_OP_LABELS[op],
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
  placeholder,
  portalContainer,
  staticItems,
}: MultiSelectFilterSectionProps) {
  const { op, values } = getMultiSelectArrayFilter(filters, field)

  return (
    <div className="flex flex-col gap-2">
      <Tabs<MultiSelectArrayOp>
        variant="secondary"
        size="sm"
        options={OPERATOR_TABS}
        active={op}
        onSelect={(nextOp) => {
          onFiltersChange(setMultiSelectField(filters, field, nextOp, values))
        }}
      />
      <MultiSelectFilter
        mode={mode}
        projectId={projectId}
        column={field}
        selected={values}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(portalContainer !== undefined ? { portalContainer } : {})}
        {...(staticItems !== undefined ? { staticItems } : {})}
        onChange={(nextValues) => {
          onFiltersChange(setMultiSelectField(filters, field, op, nextValues))
        }}
      />
    </div>
  )
}
