import { Button, Text } from "@repo/ui"
import { ArrowDown, GripVertical } from "lucide-react"
import { useCallback, useState } from "react"
import type { ColumnMapping, CsvTransformOptions } from "../../../../../../domains/datasets/column-mapping.ts"

type Bucket = keyof ColumnMapping

interface ColumnMapperProps {
  headers: string[]
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  options: CsvTransformOptions
  onOptionsChange: (options: CsvTransformOptions) => void
  onSave: () => void
  saving: boolean
}

const bucketMeta: Record<
  Bucket,
  { label: string; icon: string; border: string; bg: string; badge: string; dropHighlight: string }
> = {
  input: {
    label: "Input",
    icon: "↘",
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/50 dark:bg-blue-950/20",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    dropHighlight: "border-blue-400 bg-blue-50 dark:bg-blue-950/40",
  },
  output: {
    label: "Output",
    icon: "=",
    border: "border-green-200 dark:border-green-800",
    bg: "bg-green-50/50 dark:bg-green-950/20",
    badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    dropHighlight: "border-green-400 bg-green-50 dark:bg-green-950/40",
  },
  metadata: {
    label: "Metadata",
    icon: "{}",
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/50 dark:bg-amber-950/20",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    dropHighlight: "border-amber-400 bg-amber-50 dark:bg-amber-950/40",
  },
}

const bucketOrder: Bucket[] = ["input", "output", "metadata"]

export function ColumnMapper({
  headers,
  mapping,
  onMappingChange,
  options,
  onOptionsChange,
  onSave,
  saving,
}: ColumnMapperProps) {
  const moveAllToInput = useCallback(() => {
    onMappingChange({ input: [...headers], output: [], metadata: [] })
  }, [headers, onMappingChange])

  const moveHeader = useCallback(
    (header: string, target: Bucket) => {
      const input = mapping.input.filter((h) => h !== header)
      const output = mapping.output.filter((h) => h !== header)
      const metadata = mapping.metadata.filter((h) => h !== header)

      onMappingChange({
        input: target === "input" ? [...input, header] : input,
        output: target === "output" ? [...output, header] : output,
        metadata: target === "metadata" ? [...metadata, header] : metadata,
      })
    },
    [mapping, onMappingChange],
  )

  const removeHeader = useCallback(
    (header: string) => {
      onMappingChange({
        input: mapping.input.filter((h) => h !== header),
        output: mapping.output.filter((h) => h !== header),
        metadata: mapping.metadata.filter((h) => h !== header),
      })
    },
    [mapping, onMappingChange],
  )

  const unmapped = headers.filter(
    (h) => !mapping.input.includes(h) && !mapping.output.includes(h) && !mapping.metadata.includes(h),
  )

  const totalMapped = mapping.input.length + mapping.output.length + mapping.metadata.length

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-row items-center justify-between px-4 py-3 border-b">
        <Text.H5 weight="bold">Column Mapping</Text.H5>
        <Button onClick={onSave} disabled={saving || totalMapped === 0} isLoading={saving} size="sm">
          <Text.H5 color="white">Save mapping</Text.H5>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <label className="flex flex-row items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.flattenSingleColumn}
                onChange={(e) => onOptionsChange({ ...options, flattenSingleColumn: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <Text.H6>Flatten single-column values</Text.H6>
            </label>
            <label className="flex flex-row items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.autoParseJson}
                onChange={(e) => onOptionsChange({ ...options, autoParseJson: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <Text.H6>Auto-parse objects in strings</Text.H6>
            </label>
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" size="sm" onClick={moveAllToInput}>
                <Text.H6>Move all to input</Text.H6>
              </Button>
            </div>
          </div>

          {unmapped.length > 0 && <UnmappedSection headers={unmapped} onMove={moveHeader} />}

          {bucketOrder.map((bucket) => (
            <BucketSection
              key={bucket}
              bucket={bucket}
              headers={mapping[bucket]}
              onDrop={(header) => moveHeader(header, bucket)}
              onRemove={removeHeader}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function UnmappedSection({ headers, onMove }: { headers: string[]; onMove: (header: string, target: Bucket) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Text.H6 weight="bold" color="foregroundMuted">
          Unassigned
        </Text.H6>
        <Text.H6 color="foregroundMuted">({headers.length})</Text.H6>
      </div>
      <div className="flex flex-col gap-1">
        {headers.map((header) => (
          <DraggableHeaderItem key={header} header={header}>
            <div className="flex flex-row items-center gap-2">
              {bucketOrder.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  className={`rounded px-1.5 py-0.5 text-xs transition-colors hover:opacity-80 ${bucketMeta[bucket].badge}`}
                  onClick={() => onMove(header, bucket)}
                >
                  {bucketMeta[bucket].label}
                </button>
              ))}
            </div>
          </DraggableHeaderItem>
        ))}
      </div>
    </div>
  )
}

function BucketSection({
  bucket,
  headers,
  onDrop,
  onRemove,
}: {
  bucket: Bucket
  headers: readonly string[]
  onDrop: (header: string) => void
  onRemove: (header: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const meta = bucketMeta[bucket]

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const header = e.dataTransfer.getData("text/plain")
      if (header) onDrop(header)
    },
    [onDrop],
  )

  return (
    <div
      role="listbox"
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${dragOver ? meta.dropHighlight : `${meta.border} ${meta.bg}`}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-row items-center gap-2">
        <span className="font-mono text-sm">{meta.icon}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
        {headers.length > 0 && <Text.H6 color="foregroundMuted">({headers.length})</Text.H6>}
      </div>

      {headers.length === 0 ? (
        <div className="flex items-center justify-center rounded border border-dashed border-current/20 py-4">
          <div className="flex flex-row items-center gap-1.5 text-muted-foreground">
            <ArrowDown className="h-3 w-3" />
            <Text.H6 color="foregroundMuted">Drop columns here</Text.H6>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {headers.map((header) => (
            <DraggableHeaderItem key={header} header={header}>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                onClick={() => onRemove(header)}
              >
                Remove
              </button>
            </DraggableHeaderItem>
          ))}
        </div>
      )}
    </div>
  )
}

function DraggableHeaderItem({ header, children }: { header: string; children: React.ReactNode }) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", header)
      e.dataTransfer.effectAllowed = "move"
    },
    [header],
  )

  return (
    <div
      role="option"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      className="flex flex-row items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-secondary/50 transition-colors"
    >
      <div className="flex flex-row items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <Text.H6>{header}</Text.H6>
      </div>
      {children}
    </div>
  )
}
