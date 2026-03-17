import { Search } from "lucide-react"
import type { InputHTMLAttributes, Ref } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"

type DataTableSearchProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>
  placeholder?: string
  className?: string
  /** Container width; Figma uses 256px (w-64) */
  inputClassName?: string
}

function DataTableSearch({
  ref,
  placeholder = "Search…",
  className,
  inputClassName,
  ...props
}: DataTableSearchProps) {
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-2 rounded-lg border border-input bg-transparent pl-3 pr-3 py-1.5 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring h-8 w-64",
        className,
      )}
      data-slot="data-table-search"
    >
      <Icon icon={Search} size="sm" className="shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        className={cn(
          "flex-1 min-w-0 border-0 bg-transparent p-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-0",
          font.size.h5,
          inputClassName,
        )}
        {...props}
      />
    </div>
  )
}

export { DataTableSearch }
