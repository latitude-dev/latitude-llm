import { Button, Text } from "@repo/ui"
import { X } from "lucide-react"
import { useState } from "react"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

function JsonView({ data }: { data: Record<string, unknown> }) {
  const formatted = JSON.stringify(data, null, 2)
  const lineCount = formatted.split("\n").length

  return (
    <div className="flex flex-row rounded-md border bg-muted/50 overflow-x-auto">
      <div className="flex flex-col items-end px-2 py-3 border-r bg-muted/80 select-none">
        {Array.from({ length: lineCount }, (_, i) => `line-${i + 1}`).map((key, i) => (
          <Text.H6 key={key} color="foregroundMuted" className="leading-5 font-mono">
            {i + 1}
          </Text.H6>
        ))}
      </div>
      <pre className="flex-1 px-3 py-3 text-sm font-mono leading-5 whitespace-pre overflow-x-auto">{formatted}</pre>
    </div>
  )
}

function CollapsibleSection({
  title,
  data,
  defaultOpen = true,
}: {
  title: string
  data: Record<string, unknown>
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="flex items-center gap-1.5 cursor-pointer" onClick={() => setOpen(!open)}>
        <Text.H6 color="foregroundMuted">{open ? "▾" : "▸"}</Text.H6>
        <Text.H5 weight="bold">{title}</Text.H5>
      </button>
      {open && <JsonView data={data} />}
    </div>
  )
}

export function RowDetailPanel({
  row,
  onClose,
}: {
  row: DatasetRowRecord
  onClose: () => void
}) {
  return (
    <div className="flex flex-col h-full border-l">
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <Text.H5 color="foregroundMuted" className="font-mono truncate">
          {row.rowId}
        </Text.H5>
        <Button flat variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <CollapsibleSection title="Input" data={row.input} />
        <CollapsibleSection title="Output" data={row.output} />
        <CollapsibleSection title="Metadata" data={row.metadata} />
      </div>
    </div>
  )
}
