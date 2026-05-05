import {
  Button,
  cn,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@repo/ui"
import { ChevronDown, Columns2Icon, EyeIcon, EyeOffIcon, GripVerticalIcon, LockIcon } from "lucide-react"
import { type DragEvent, useState } from "react"

export interface TableColumnOption {
  readonly id: string
  readonly label: string
  readonly required?: boolean
}

export function ColumnsSelector({
  columns,
  selectedColumnIds,
  onChange,
  onOrderChange,
  disabled = false,
}: {
  readonly columns: readonly TableColumnOption[]
  readonly selectedColumnIds: readonly string[]
  readonly onChange: (nextColumnIds: string[]) => void
  readonly onOrderChange?: (nextColumnIds: string[]) => void
  readonly disabled?: boolean
}) {
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const [dragTargetColumnId, setDragTargetColumnId] = useState<string | null>(null)

  function handleDragStart(event: DragEvent, columnId: string) {
    if (!onOrderChange) return
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", columnId)
    setDraggedColumnId(columnId)
  }

  function handleDragOver(event: DragEvent, columnId: string) {
    if (!draggedColumnId || draggedColumnId === columnId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragTargetColumnId(columnId)
  }

  function handleDrop(event: DragEvent, columnId: string) {
    if (!onOrderChange) return
    event.preventDefault()
    const sourceColumnId = draggedColumnId ?? event.dataTransfer.getData("text/plain")
    if (!sourceColumnId || sourceColumnId === columnId) return

    const orderedColumnIds = columns.map((column) => column.id)
    const sourceIndex = orderedColumnIds.indexOf(sourceColumnId)
    const targetIndex = orderedColumnIds.indexOf(columnId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const nextColumnIds = [...orderedColumnIds]
    const [movedColumnId] = nextColumnIds.splice(sourceIndex, 1)
    if (!movedColumnId) return
    nextColumnIds.splice(targetIndex, 0, movedColumnId)
    onOrderChange(nextColumnIds)
    setDraggedColumnId(null)
    setDragTargetColumnId(null)
  }

  function handleDragEnd() {
    setDraggedColumnId(null)
    setDragTargetColumnId(null)
  }

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Icon icon={Columns2Icon} size="sm" />
          Columns
          <Icon icon={ChevronDown} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => {
          const checked = selectedColumnIds.includes(column.id)
          const required = column.required === true

          function toggleColumn() {
            if (required) return
            const nextSelectedColumnIds = new Set(selectedColumnIds)
            if (checked) {
              nextSelectedColumnIds.delete(column.id)
            } else {
              nextSelectedColumnIds.add(column.id)
            }
            onChange(columns.map((option) => option.id).filter((columnId) => nextSelectedColumnIds.has(columnId)))
          }

          return (
            <DropdownMenuItem
              key={column.id}
              onSelect={(event) => event.preventDefault()}
              onDragOver={(event) => handleDragOver(event, column.id)}
              onDragLeave={() => setDragTargetColumnId(null)}
              onDrop={(event) => handleDrop(event, column.id)}
              onClick={toggleColumn}
              className={cn("group cursor-pointer gap-2", {
                "bg-accent": dragTargetColumnId === column.id,
                "opacity-50": draggedColumnId === column.id,
              })}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Drag ${column.label} column`}
                draggable={Boolean(onOrderChange)}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onDragStart={(event) => handleDragStart(event, column.id)}
                onDragEnd={handleDragEnd}
                className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
              >
                <Icon icon={GripVerticalIcon} size="sm" />
              </button>
              <span className="min-w-0 flex-1 truncate">{column.label}</span>
              {required ? (
                <span className="flex items-center text-muted-foreground">
                  <Icon icon={LockIcon} size="sm" />
                </span>
              ) : checked ? (
                <span className="flex items-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                  <Icon icon={EyeIcon} size="sm" />
                </span>
              ) : (
                <span className="flex items-center text-muted-foreground">
                  <Icon icon={EyeOffIcon} size="sm" />
                </span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}
