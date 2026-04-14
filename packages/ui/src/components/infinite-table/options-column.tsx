import { DropdownMenu, type MenuOption } from "../dropdown-menu/dropdown-menu.tsx"
import type { InfiniteTableColumn } from "./types.ts"

export interface OptionsColumnConfig<T> {
  getOptions: (row: T) => MenuOption[]
  align?: "start" | "end"
  width?: number
}

export function optionsColumn<T>(config: OptionsColumnConfig<T>): InfiniteTableColumn<T> {
  const { getOptions, align = "end", width = 64 } = config
  return {
    key: "__options__",
    header: "",
    width,
    minWidth: width,
    align,
    ellipsis: false,
    resizable: false,
    render: (row) => (
      <span role="none" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <DropdownMenu triggerButtonProps={{ variant: "ghost" }} align={align} options={getOptions(row)} />
      </span>
    ),
  }
}
