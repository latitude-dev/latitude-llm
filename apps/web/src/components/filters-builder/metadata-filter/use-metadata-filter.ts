import type { FilterCondition, FilterSet } from "@domain/shared"
import { useCallback, useMemo } from "react"

export interface MetadataEntry {
  key: string
  value: string
}

export function useMetadataFilter(value: FilterSet, onChange: (filters: FilterSet) => void) {
  const entries = useMemo(() => {
    const result: MetadataEntry[] = []
    for (const [field, conditions] of Object.entries(value)) {
      if (!field.startsWith("metadata.")) continue
      const key = field.slice("metadata.".length)
      for (const cond of conditions) {
        if (cond.op === "eq" && typeof cond.value === "string") {
          result.push({ key, value: cond.value })
        }
      }
    }
    return result
  }, [value])

  const hasFilters = entries.length > 0 || Object.keys(value).some((k) => k.startsWith("metadata."))

  const handleChange = useCallback(
    (newEntries: MetadataEntry[]) => {
      const next: Record<string, readonly FilterCondition[]> = {}
      for (const [key, val] of Object.entries(value)) {
        if (!key.startsWith("metadata.")) next[key] = val
      }
      for (const entry of newEntries) {
        const trimmedKey = entry.key.trim()
        const trimmedValue = entry.value.trim()
        if (trimmedKey && trimmedValue) {
          next[`metadata.${trimmedKey}`] = [{ op: "eq", value: trimmedValue }]
        }
      }
      onChange(next)
    },
    [value, onChange],
  )

  const removeAll = useCallback(() => {
    const next: Record<string, readonly FilterCondition[]> = {}
    for (const [key, val] of Object.entries(value)) {
      if (!key.startsWith("metadata.")) next[key] = val
    }
    onChange(next)
  }, [value, onChange])

  return { entries, hasFilters, handleChange, removeAll }
}
