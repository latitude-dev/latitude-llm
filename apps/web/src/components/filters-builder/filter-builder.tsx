import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, CheckboxInput, DropdownMenu, Icon, Input, Text } from "@repo/ui"
import { PlusIcon } from "lucide-react"
import { type RefObject, useCallback, useMemo, useState } from "react"
import { MULTI_SELECT_FIELDS, NUMBER_RANGE_FIELDS, STATUS_OPTIONS, TEXT_FIELDS } from "./constants.ts"
import { FilterSection } from "./filter-section.tsx"
import { MetadataFilter } from "./metadata-filter/metadata-filter.tsx"
import { useMetadataFilter } from "./metadata-filter/use-metadata-filter.ts"
import { MultiSelectFilter } from "./multi-select-filter.tsx"
import { NumberRangeFilter } from "./number-range-filter.tsx"
import type { ActiveFilter, DistinctColumn, FilterType } from "./types.ts"
import { getInValues, getRangeValues, getTextFilterValue, setFieldConditions } from "./utils.ts"

interface FilterBuilderProps {
  readonly projectId: string
  readonly value: FilterSet
  readonly onChange: (filters: FilterSet) => void
  readonly disabled?: boolean
  readonly emptyMessage?: string
  readonly portalContainer?: RefObject<HTMLElement | null>
}

export function FilterBuilder({
  projectId,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No filters configured.",
  portalContainer,
}: FilterBuilderProps) {
  const [metadataOpen, setMetadataOpen] = useState(false)
  const {
    entries: metadataEntries,
    hasFilters: hasMetadataFilters,
    handleChange: handleMetadataChange,
    removeAll: removeAllMetadata,
  } = useMetadataFilter(value, onChange)

  const showMetadata = metadataOpen || hasMetadataFilters

  const activeFilters = useMemo((): ActiveFilter[] => {
    const filters: ActiveFilter[] = []

    if (value.status) {
      filters.push({ type: "status", field: "status", label: "Status" })
    }

    for (const { field, label } of TEXT_FIELDS) {
      if (value[field]) {
        filters.push({ type: "text", field, label })
      }
    }

    for (const { field, label } of MULTI_SELECT_FIELDS) {
      if (value[field]) {
        filters.push({ type: "multiSelect", field, label })
      }
    }

    for (const { field, label } of NUMBER_RANGE_FIELDS) {
      if (value[field]) {
        filters.push({ type: "numberRange", field, label })
      }
    }

    if (showMetadata) {
      filters.push({ type: "metadata", field: "metadata", label: "Metadata" })
    }

    return filters
  }, [value, showMetadata])

  const availableFilters = useMemo(() => {
    const activeFields = new Set(activeFilters.map((f) => f.field))
    const available: { type: FilterType; field: string; label: string }[] = []

    if (!activeFields.has("status")) {
      available.push({ type: "status", field: "status", label: "Status" })
    }

    for (const { field, label } of TEXT_FIELDS) {
      if (!activeFields.has(field)) {
        available.push({ type: "text", field, label })
      }
    }

    for (const { field, label } of MULTI_SELECT_FIELDS) {
      if (!activeFields.has(field)) {
        available.push({ type: "multiSelect", field, label })
      }
    }

    for (const { field, label } of NUMBER_RANGE_FIELDS) {
      if (!activeFields.has(field)) {
        available.push({ type: "numberRange", field, label })
      }
    }

    if (!activeFields.has("metadata")) {
      available.push({ type: "metadata", field: "metadata", label: "Metadata" })
    }

    return available
  }, [activeFilters])

  const setField = useCallback(
    (field: string, conditions: FilterCondition[]) => {
      onChange(setFieldConditions(value, field, conditions))
    },
    [value, onChange],
  )

  const removeFilter = useCallback(
    (field: string) => {
      if (field === "metadata") {
        removeAllMetadata()
        setMetadataOpen(false)
      } else {
        const { [field]: _, ...rest } = value
        onChange(rest)
      }
    },
    [value, onChange, removeAllMetadata],
  )

  const addFilter = useCallback(
    (filter: { type: FilterType; field: string }) => {
      if (filter.type === "status") {
        setField("status", [{ op: "in", value: [] }])
      } else if (filter.type === "text") {
        setField(filter.field, [{ op: "contains", value: "" }])
      } else if (filter.type === "multiSelect") {
        setField(filter.field, [{ op: "in", value: [] }])
      } else if (filter.type === "numberRange") {
        onChange({ ...value, [filter.field]: [] })
      } else if (filter.type === "metadata") {
        setMetadataOpen(true)
      }
    },
    [setField, onChange, value],
  )

  const statusValues = getInValues(value, "status")

  return (
    <div className="flex flex-col gap-3">
      {activeFilters.map((filter) => {
        if (filter.type === "status") {
          return (
            <FilterSection
              key={filter.field}
              label={filter.label}
              {...(disabled ? {} : { onRemove: () => removeFilter(filter.field) })}
            >
              <div className="flex flex-col gap-1">
                {STATUS_OPTIONS.map((status) => (
                  <CheckboxInput
                    key={status}
                    label={status.toUpperCase()}
                    checked={statusValues.includes(status)}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      if (disabled) return
                      const current = [...statusValues]
                      const next = checked ? [...current, status] : current.filter((s) => s !== status)
                      setField("status", next.length > 0 ? [{ op: "in", value: next }] : [])
                    }}
                  />
                ))}
              </div>
            </FilterSection>
          )
        }

        if (filter.type === "text") {
          const textField = TEXT_FIELDS.find((f) => f.field === filter.field)
          const textValue = getTextFilterValue(value, filter.field)
          return (
            <FilterSection
              key={filter.field}
              label={filter.label}
              {...(disabled ? {} : { onRemove: () => removeFilter(filter.field) })}
            >
              <Input
                placeholder={textField?.placeholder ?? "Enter value..."}
                size="sm"
                value={textValue}
                disabled={disabled}
                onChange={(e) => {
                  const nextValue = e.target.value
                  setField(filter.field, nextValue ? [{ op: "contains", value: nextValue }] : [])
                }}
              />
            </FilterSection>
          )
        }

        if (filter.type === "multiSelect") {
          const selectedValues = getInValues(value, filter.field)
          return (
            <FilterSection
              key={filter.field}
              label={filter.label}
              {...(disabled ? {} : { onRemove: () => removeFilter(filter.field) })}
            >
              <MultiSelectFilter
                projectId={projectId}
                column={filter.field as DistinctColumn}
                selected={selectedValues}
                disabled={disabled}
                onChange={(values) => setField(filter.field, values.length > 0 ? [{ op: "in", value: values }] : [])}
                {...(portalContainer ? { portalContainer } : {})}
              />
            </FilterSection>
          )
        }

        if (filter.type === "numberRange") {
          const range = getRangeValues(value, filter.field)
          return (
            <FilterSection
              key={filter.field}
              label={filter.label}
              {...(disabled ? {} : { onRemove: () => removeFilter(filter.field) })}
            >
              <NumberRangeFilter
                minValue={range.min}
                maxValue={range.max}
                disabled={disabled}
                onMinChange={(min) => {
                  const conditions: FilterCondition[] = []
                  if (min !== undefined) conditions.push({ op: "gte", value: min })
                  if (range.max !== undefined) conditions.push({ op: "lte", value: range.max })
                  onChange({ ...value, [filter.field]: conditions })
                }}
                onMaxChange={(max) => {
                  const conditions: FilterCondition[] = []
                  if (range.min !== undefined) conditions.push({ op: "gte", value: range.min })
                  if (max !== undefined) conditions.push({ op: "lte", value: max })
                  onChange({ ...value, [filter.field]: conditions })
                }}
              />
            </FilterSection>
          )
        }

        if (filter.type === "metadata") {
          return (
            <FilterSection
              key={filter.field}
              label={filter.label}
              {...(disabled ? {} : { onRemove: () => removeFilter(filter.field) })}
            >
              <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} disabled={disabled} />
            </FilterSection>
          )
        }

        return null
      })}

      {!disabled && availableFilters.length > 0 && (
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
      )}

      {activeFilters.length === 0 && <Text.H6 color="foregroundMuted">{emptyMessage}</Text.H6>}
    </div>
  )
}
