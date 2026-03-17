import type { ReactNode } from "react"

import { cn } from "../../utils/cn.ts"

type DataTableToolbarProps = {
  /** Left slot: e.g. search input (Figma: 256px width, h-8, rounded-lg) */
  left?: ReactNode
  /** Right slot: e.g. primary action button ("Create dataset") */
  right?: ReactNode
  className?: string
}

function DataTableToolbar({ left, right, className }: DataTableToolbarProps) {
  return (
    <div
      className={cn("flex flex-row flex-wrap items-center justify-between gap-4", className)}
      data-slot="data-table-toolbar"
    >
      {left != null ? <div className="flex shrink-0">{left}</div> : null}
      {right != null ? <div className="flex shrink-0">{right}</div> : null}
    </div>
  )
}

export { DataTableToolbar }
