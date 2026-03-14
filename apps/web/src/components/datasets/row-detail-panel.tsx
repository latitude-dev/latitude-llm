import { Button, RichTextEditor, Text } from "@repo/ui"
import { safeStringifyJson } from "@repo/utils"
import { Loader2, Save, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { DatasetRowRecord } from "../../domains/datasets/datasets.functions.ts"

function EditableSection({
  title,
  value,
  onChange,
  defaultOpen = true,
}: {
  title: string
  value: string
  onChange: (value: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="flex items-center gap-1.5 cursor-pointer" onClick={() => setOpen(!open)}>
        <Text.H6 color="foregroundMuted">{open ? "▾" : "▸"}</Text.H6>
        <Text.H5 weight="bold">{title}</Text.H5>
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          <RichTextEditor value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

export function RowDetailPanel({
  row,
  onClose,
  onSave,
  saving = false,
}: {
  row: DatasetRowRecord
  onClose: () => void
  onSave?: (data: { input: string; output: string; metadata: string }) => void
  saving?: boolean
}) {
  const [inputText, setInputText] = useState(() => safeStringifyJson(row.input))
  const [outputText, setOutputText] = useState(() => safeStringifyJson(row.output))
  const [metadataText, setMetadataText] = useState(() => safeStringifyJson(row.metadata))

  useEffect(() => {
    setInputText(safeStringifyJson(row.input))
    setOutputText(safeStringifyJson(row.output))
    setMetadataText(safeStringifyJson(row.metadata))
  }, [row.input, row.output, row.metadata])

  const handleSave = useCallback(() => {
    onSave?.({ input: inputText, output: outputText, metadata: metadataText })
  }, [inputText, outputText, metadataText, onSave])

  return (
    <div className="flex flex-col h-full border-l">
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <Text.H5 color="foregroundMuted" className="font-mono truncate">
          {row.rowId}
        </Text.H5>
        <div className="flex flex-row items-center gap-2">
          {onSave && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <Text.H6 color="white">Save Data</Text.H6>
            </Button>
          )}
          <Button flat variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <EditableSection title="Input" value={inputText} onChange={setInputText} />
        <EditableSection title="Output" value={outputText} onChange={setOutputText} />
        <EditableSection title="Metadata" value={metadataText} onChange={setMetadataText} />
      </div>
    </div>
  )
}
