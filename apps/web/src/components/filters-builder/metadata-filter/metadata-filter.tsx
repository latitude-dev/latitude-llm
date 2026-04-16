import { Button, Icon, Input } from "@repo/ui"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { MetadataEntry } from "./use-metadata-filter.ts"

interface MetadataFilterProps {
  readonly entries: readonly MetadataEntry[]
  readonly onChange: (entries: MetadataEntry[]) => void
  readonly disabled?: boolean
}

export function MetadataFilter({ entries: committedEntries, onChange, disabled }: MetadataFilterProps) {
  const [localEntries, setLocalEntries] = useState<MetadataEntry[]>(() => [...committedEntries])

  const persistedSnapshot = useMemo(
    () => JSON.stringify(committedEntries.map((e) => [e.key, e.value])),
    [committedEntries],
  )

  // Sync from parent when persisted metadata rows change (e.g. preset load, remove filter). Partial rows with an
  // empty key are not in committedEntries, so the snapshot stays stable while typing only value or key first.
  useEffect(() => {
    setLocalEntries([...committedEntries])
  }, [persistedSnapshot, committedEntries])

  const propagate = useCallback(
    (entries: MetadataEntry[]) => {
      setLocalEntries(entries)
      onChange(entries)
    },
    [onChange],
  )

  const addEntry = useCallback(() => {
    setLocalEntries((prev) => [...prev, { key: "", value: "" }])
  }, [])

  const removeEntry = useCallback(
    (index: number) => {
      propagate(localEntries.filter((_, i) => i !== index))
    },
    [localEntries, propagate],
  )

  const updateEntry = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      propagate(localEntries.map((e, i) => (i === index ? { ...e, [field]: val } : e)))
    },
    [localEntries, propagate],
  )

  return (
    <div className="flex flex-col gap-2">
      {localEntries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            size="sm"
            placeholder="Key"
            value={entry.key}
            disabled={disabled}
            onChange={(e) => updateEntry(i, "key", e.target.value)}
          />
          <span className="text-xs text-muted-foreground">=</span>
          <Input
            size="sm"
            placeholder="Value"
            value={entry.value}
            disabled={disabled}
            onChange={(e) => updateEntry(i, "value", e.target.value)}
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => removeEntry(i)}
            >
              <Icon icon={Trash2Icon} size="xs" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="ghost" onClick={addEntry}>
          <Icon icon={PlusIcon} size="xs" />
          Add condition
        </Button>
      )}
    </div>
  )
}
