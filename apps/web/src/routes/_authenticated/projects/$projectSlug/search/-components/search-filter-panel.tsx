import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, DropdownMenu, Icon, Input, Text } from "@repo/ui"
import { PlusIcon } from "lucide-react"
import { useRef, useState } from "react"
import { DateRangeFilter } from "../../../../../../components/filters-builder/date-range-filter.tsx"
import {
  MULTI_SELECT_FIELDS,
  NUMBER_RANGE_FIELDS,
  TEXT_FIELDS,
} from "../../../../../../components/filters-builder/constants.ts"
import { FilterSection } from "../../../../../../components/filters-builder/filter-section.tsx"
import { MetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import { useMetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/use-metadata-filter.ts"
import { MultiSelectFilter } from "../../../../../../components/filters-builder/multi-select-filter.tsx"
import { NumberRangeFilter } from "../../../../../../components/filters-builder/number-range-filter.tsx"
import type { DistinctColumn, FilterType } from "../../../../../../components/filters-builder/types.ts"
import {
  getInValues,
  getRangeValues,
  getTextFilterValue,
  setFieldConditions,
} from "../../../../../../components/filters-builder/utils.ts"

interface SearchFilterPanelProps {
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFiltersChange: (next: FilterSet) => void
}

interface ActivePanelFilter {
  readonly type: FilterType
  readonly field: string
  readonly label: string
}

export function SearchFilterPanel({ projectId, filters, onFiltersChange }: SearchFilterPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const {
    entries: metadataEntries,
    hasFilters: hasMetadataFilters,
    handleChange: handleMetadataChange,
    removeAll: removeAllMetadata,
  } = useMetadataFilter(filters, onFiltersChange)
  const showMetadata = metadataOpen || hasMetadataFilters

  const activeFilters: ActivePanelFilter[] = []
  for (const { field, label } of TEXT_FIELDS) {
    if (filters[field]) activeFilters.push({ type: "text", field, label })
  }
  for (const { field, label } of MULTI_SELECT_FIELDS) {
    if (filters[field]) activeFilters.push({ type: "multiSelect", field, label })
  }
  for (const { field, label } of NUMBER_RANGE_FIELDS) {
    if (filters[field]) activeFilters.push({ type: "numberRange", field, label })
  }
  if (showMetadata) {
    activeFilters.push({ type: "metadata", field: "metadata", label: "Metadata" })
  }

  const activeFieldSet = new Set(activeFilters.map((f) => f.field))
  const availableFilters: ActivePanelFilter[] = []
  for (const { field, label } of TEXT_FIELDS) {
    if (!activeFieldSet.has(field)) availableFilters.push({ type: "text", field, label })
  }
  for (const { field, label } of MULTI_SELECT_FIELDS) {
    if (!activeFieldSet.has(field)) availableFilters.push({ type: "multiSelect", field, label })
  }
  for (const { field, label } of NUMBER_RANGE_FIELDS) {
    if (!activeFieldSet.has(field)) availableFilters.push({ type: "numberRange", field, label })
  }
  if (!activeFieldSet.has("metadata")) {
    availableFilters.push({ type: "metadata", field: "metadata", label: "Metadata" })
  }

  const setField = (field: string, conditions: FilterCondition[]) => {
    onFiltersChange(setFieldConditions(filters, field, conditions))
  }

  const removeFilter = (field: string) => {
    if (field === "metadata") {
      removeAllMetadata()
      setMetadataOpen(false)
      return
    }
    const { [field]: _, ...rest } = filters
    onFiltersChange(rest)
  }

  const addFilter = (filter: ActivePanelFilter) => {
    if (filter.type === "text") {
      setField(filter.field, [{ op: "contains", value: "" }])
    } else if (filter.type === "multiSelect") {
      setField(filter.field, [{ op: "in", value: [] }])
    } else if (filter.type === "numberRange") {
      onFiltersChange({ ...filters, [filter.field]: [] })
    } else if (filter.type === "metadata") {
      setMetadataOpen(true)
    }
  }

  return (
    <div ref={containerRef} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
      <FilterSection label="Time">
        <DateRangeFilter filters={filters} onChange={onFiltersChange} />
      </FilterSection>

      {activeFilters.map((filter) => {
        if (filter.type === "text") {
          const textField = TEXT_FIELDS.find((f) => f.field === filter.field)
          const textValue = getTextFilterValue(filters, filter.field)
          return (
            <FilterSection key={filter.field} label={filter.label} onRemove={() => removeFilter(filter.field)}>
              <Input
                placeholder={textField?.placeholder ?? "Enter value..."}
                size="sm"
                value={textValue}
                onChange={(event) => {
                  const next = event.target.value
                  setField(filter.field, next ? [{ op: "contains", value: next }] : [])
                }}
              />
            </FilterSection>
          )
        }

        if (filter.type === "multiSelect") {
          const selectedValues = getInValues(filters, filter.field)
          return (
            <FilterSection key={filter.field} label={filter.label} onRemove={() => removeFilter(filter.field)}>
              <MultiSelectFilter
                projectId={projectId}
                column={filter.field as DistinctColumn}
                selected={selectedValues}
                portalContainer={containerRef}
                onChange={(values) =>
                  setField(filter.field, values.length > 0 ? [{ op: "in", value: values }] : [])
                }
              />
            </FilterSection>
          )
        }

        if (filter.type === "numberRange") {
          const range = getRangeValues(filters, filter.field)
          return (
            <FilterSection key={filter.field} label={filter.label} onRemove={() => removeFilter(filter.field)}>
              <NumberRangeFilter
                minValue={range.min}
                maxValue={range.max}
                onMinChange={(min) => {
                  const conditions: FilterCondition[] = []
                  if (min !== undefined) conditions.push({ op: "gte", value: min })
                  if (range.max !== undefined) conditions.push({ op: "lte", value: range.max })
                  onFiltersChange({ ...filters, [filter.field]: conditions })
                }}
                onMaxChange={(max) => {
                  const conditions: FilterCondition[] = []
                  if (range.min !== undefined) conditions.push({ op: "gte", value: range.min })
                  if (max !== undefined) conditions.push({ op: "lte", value: max })
                  onFiltersChange({ ...filters, [filter.field]: conditions })
                }}
              />
            </FilterSection>
          )
        }

        if (filter.type === "metadata") {
          return (
            <FilterSection key={filter.field} label={filter.label} onRemove={() => removeFilter(filter.field)}>
              <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} />
            </FilterSection>
          )
        }

        return null
      })}

      {availableFilters.length > 0 ? (
        <div className="w-fit self-start">
          <DropdownMenu
            side="bottom"
            align="start"
            trigger={() => (
              <Button type="button" variant="outline" size="sm">
                <Icon icon={PlusIcon} size="sm" />
                Add filter
              </Button>
            )}
            options={availableFilters.map((filter) => ({
              label: filter.label,
              onClick: () => addFilter(filter),
            }))}
          />
        </div>
      ) : null}

      {activeFilters.length === 0 ? (
        <Text.H6 color="foregroundMuted" centered>
          Add filters to narrow down your search.
        </Text.H6>
      ) : null}
    </div>
  )
}
