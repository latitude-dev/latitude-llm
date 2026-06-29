import { type DatasetColumn, effectiveColumns, materializeColumns } from "@domain/datasets"
import { Button, cn, Icon, Input, Popover, PopoverContent, PopoverTrigger, Text, ToastAction, toast } from "@repo/ui"
import {
  ChevronDown,
  ChevronLeft,
  Columns2Icon,
  GripVerticalIcon,
  PencilIcon,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { type DragEvent, useState } from "react"
import {
  addDatasetColumn,
  removeDatasetColumn,
  reorderDatasetColumns,
  restoreDatasetColumn,
  updateDatasetColumn,
} from "../../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"

type View = { kind: "list" } | { kind: "edit"; column: DatasetColumn } | { kind: "add" }

export function DatasetColumnsSelector({
  datasetId,
  projectId,
  columns,
}: {
  datasetId: string
  projectId: string
  columns: DatasetColumn[] | null
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: "list" })
  const [busy, setBusy] = useState(false)
  const current = effectiveColumns(columns)
  const removedColumns = materializeColumns(columns).filter((c) => c.removed)

  const refresh = async () => {
    const qc = getQueryClient()
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["dataset", datasetId] }),
      qc.invalidateQueries({ queryKey: ["datasets", projectId] }),
      qc.invalidateQueries({ queryKey: ["datasetRows", datasetId] }),
    ])
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await refresh()
      return true
    } catch (e) {
      toast({
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to update columns",
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  // Removal is a soft-delete: the descriptor (and its row values) are kept, so restoring re-attaches the data.
  const restore = (identifier: string) => run(() => restoreDatasetColumn({ data: { datasetId, identifier } }))

  const deleteColumn = async (column: DatasetColumn) => {
    const ok = await run(() => removeDatasetColumn({ data: { datasetId, identifier: column.identifier } }))
    if (!ok) return false
    toast({
      description: `Column "${column.name}" removed. Re-add it any time from Removed columns.`,
      action: (
        <ToastAction altText="Undo column removal" onClick={() => void restore(column.identifier)}>
          Undo
        </ToastAction>
      ),
    })
    return true
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setView({ kind: "list" })
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap">
          <Icon icon={Columns2Icon} size="sm" />
          <Text.H6>Columns</Text.H6>
          <Icon icon={ChevronDown} size="sm" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        {view.kind === "list" ? (
          <ColumnList
            columns={current}
            removedColumns={removedColumns}
            busy={busy}
            onEdit={(column) => setView({ kind: "edit", column })}
            onAdd={() => setView({ kind: "add" })}
            onRestore={(identifier) => void restore(identifier)}
            onRemove={(column) => void deleteColumn(column)}
            onReorder={(order) => run(() => reorderDatasetColumns({ data: { datasetId, order } }))}
          />
        ) : view.kind === "edit" ? (
          <EditColumnForm
            key={view.column.identifier}
            column={view.column}
            busy={busy}
            onBack={() => setView({ kind: "list" })}
            onSave={async (name) => {
              const ok = await run(() =>
                updateDatasetColumn({
                  data: { datasetId, identifier: view.column.identifier, name },
                }),
              )
              if (ok) setView({ kind: "list" })
            }}
          />
        ) : (
          <AddColumnForm
            busy={busy}
            onBack={() => setView({ kind: "list" })}
            onAdd={async (name) => {
              const ok = await run(() => addDatasetColumn({ data: { datasetId, name } }))
              if (ok) setView({ kind: "list" })
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function ColumnList({
  columns,
  removedColumns,
  busy,
  onEdit,
  onAdd,
  onRestore,
  onRemove,
  onReorder,
}: {
  columns: DatasetColumn[]
  removedColumns: DatasetColumn[]
  busy: boolean
  onEdit: (column: DatasetColumn) => void
  onAdd: () => void
  onRestore: (identifier: string) => void
  onRemove: (column: DatasetColumn) => void
  onReorder: (order: string[]) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [target, setTarget] = useState<{
    id: string
    position: "before" | "after"
  } | null>(null)

  const handleDragOver = (event: DragEvent<HTMLDivElement>, overId: string) => {
    if (!draggedId || draggedId === overId) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setTarget((prev) => (prev?.id === overId && prev.position === position ? prev : { id: overId, position }))
  }

  const handleDrop = (event: DragEvent, overId: string) => {
    event.preventDefault()
    const sourceId = draggedId ?? event.dataTransfer.getData("text/plain")
    const position = target?.position ?? "before"
    setDraggedId(null)
    setTarget(null)
    if (!sourceId || sourceId === overId) return
    const ids = columns.map((c) => c.identifier)
    const from = ids.indexOf(sourceId)
    if (from < 0 || ids.indexOf(overId) < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    const overIndex = next.indexOf(overId)
    next.splice(position === "after" ? overIndex + 1 : overIndex, 0, moved)
    onReorder(next)
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2">
        <Text.H6B>Columns</Text.H6B>
      </div>
      <div className="border-t border-border" />
      <div className="flex flex-col p-1">
        {columns.map((column) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: row is a drag-and-drop drop target for reordering
          <div
            key={column.identifier}
            onDragOver={(e) => handleDragOver(e, column.identifier)}
            onDragLeave={() => setTarget((prev) => (prev?.id === column.identifier ? null : prev))}
            onDrop={(e) => handleDrop(e, column.identifier)}
            className={cn("group relative flex items-center gap-2 rounded-md px-2 py-1.5", {
              "opacity-50": draggedId === column.identifier,
            })}
          >
            {target?.id === column.identifier ? (
              <span
                className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary", {
                  "-top-px": target.position === "before",
                  "-bottom-px": target.position === "after",
                })}
              />
            ) : null}
            <button
              type="button"
              aria-label={`Reorder ${column.name}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", column.identifier)
                setDraggedId(column.identifier)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setTarget(null)
              }}
              className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
            >
              <Icon icon={GripVerticalIcon} size="sm" />
            </button>
            <span className="min-w-0 flex-1 truncate">
              <Text.H6 ellipsis>{column.name}</Text.H6>
            </span>
            <button
              type="button"
              aria-label={`Rename ${column.name}`}
              disabled={busy}
              onClick={() => onEdit(column)}
              className="flex items-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <Icon icon={PencilIcon} size="sm" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${column.name}`}
              disabled={busy}
              onClick={() => onRemove(column)}
              className="flex items-center text-muted-foreground hover:text-destructive"
            >
              <Icon icon={Trash2} size="sm" />
            </button>
          </div>
        ))}
      </div>
      {removedColumns.length > 0 ? (
        <>
          <div className="border-t border-border" />
          <div className="px-3 pb-1 pt-2">
            <Text.H6 color="foregroundMuted">Removed columns</Text.H6>
          </div>
          <div className="flex flex-col p-1 pt-0">
            {removedColumns.map((column) => (
              <div key={column.identifier} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  <Text.H6 color="foregroundMuted" ellipsis>
                    {column.name}
                  </Text.H6>
                </span>
                <button
                  type="button"
                  aria-label={`Re-add ${column.name}`}
                  disabled={busy}
                  onClick={() => onRestore(column.identifier)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Icon icon={RotateCcw} size="sm" />
                  <Text.H6>Re-add</Text.H6>
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="border-t border-border" />
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Icon icon={Plus} size="sm" />
        <Text.H6>New column</Text.H6>
      </button>
    </div>
  )
}

function EditColumnForm({
  column,
  busy,
  onBack,
  onSave,
}: {
  column: DatasetColumn
  busy: boolean
  onBack: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(column.name)
  const trimmed = name.trim()

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <Text.H6B>Edit column</Text.H6B>
      </div>
      <div className="border-t border-border" />
      <div className="flex flex-col gap-3 p-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed !== "") onSave(trimmed)
          }}
          disabled={busy}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => onSave(trimmed)}
            disabled={busy || trimmed === "" || trimmed === column.name}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function AddColumnForm({ busy, onBack, onAdd }: { busy: boolean; onBack: () => void; onAdd: (name: string) => void }) {
  const [name, setName] = useState("")
  const trimmed = name.trim()

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon icon={ChevronLeft} size="sm" />
        </button>
        <Text.H6B>New column</Text.H6B>
      </div>
      <div className="border-t border-border" />
      <div className="flex flex-col gap-3 p-3">
        <Input
          autoFocus
          placeholder="Column name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed !== "") onAdd(trimmed)
          }}
          disabled={busy}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => onAdd(trimmed)} disabled={busy || trimmed === ""}>
            <Icon icon={Plus} size="sm" />
            Add column
          </Button>
        </div>
      </div>
    </div>
  )
}
