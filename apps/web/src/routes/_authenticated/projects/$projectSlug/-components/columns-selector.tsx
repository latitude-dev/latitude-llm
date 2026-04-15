import {
  Button,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@repo/ui"
import { ChevronDown, Columns2Icon } from "lucide-react"

export interface TableColumnOption {
  readonly id: string
  readonly label: string
  readonly required?: boolean
}

export function ColumnsSelector({
  columns,
  selectedColumnIds,
  onChange,
  disabled = false,
}: {
  readonly columns: readonly TableColumnOption[]
  readonly selectedColumnIds: readonly string[]
  readonly onChange: (nextColumnIds: string[]) => void
  readonly disabled?: boolean
}) {
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
          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={checked}
              disabled={column.required === true}
              onCheckedChange={(nextChecked) => {
                if (nextChecked) {
                  onChange([...selectedColumnIds, column.id])
                  return
                }

                onChange(selectedColumnIds.filter((selectedColumnId) => selectedColumnId !== column.id))
              }}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}
