import { Button, Input, Text } from "@repo/ui"
import { Pencil } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { renameDatasetMutation } from "../../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { parseServerError } from "../../../../../../lib/errors.ts"

export function DatasetNameEdit({ dataset, onSuccess }: { dataset: DatasetRecord; onSuccess?: () => void }) {
  const projectId = dataset.projectId
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(dataset.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(dataset.name)
  }, [dataset.name])

  const submit = useCallback(async () => {
    const trimmed = value.trim()
    if (trimmed === dataset.name) {
      setEditing(false)
      setError(null)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await renameDatasetMutation({
        data: { datasetId: dataset.id, name: trimmed },
      })
      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      setEditing(false)
      onSuccess?.()
    } catch (e) {
      const { _tag, message } = parseServerError(e)
      if (_tag === "DuplicateDatasetNameError" || _tag === "ValidationError") {
        setError(message)
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }, [dataset.id, dataset.name, dataset.projectId, value, onSuccess])

  const cancel = useCallback(() => {
    setValue(dataset.name)
    setError(null)
    setEditing(false)
  }, [dataset.name])

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-row items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
              if (e.key === "Escape") cancel()
            }}
            onBlur={() => submit()}
            disabled={saving}
            className="max-w-md"
            autoFocus
            aria-label="Dataset name"
          />
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => {
              e.preventDefault()
              cancel()
            }}
            onClick={cancel}
            disabled={saving}
          >
            <Text.H6>Cancel</Text.H6>
          </Button>
        </div>
        {error && <Text.H6 color="destructive">{error}</Text.H6>}
      </div>
    )
  }

  return (
    <div className="flex flex-row items-center gap-2">
      <Text.H3 weight="bold">{dataset.name}</Text.H3>
      <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Rename dataset">
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  )
}
