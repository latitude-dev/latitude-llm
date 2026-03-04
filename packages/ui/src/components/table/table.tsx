import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn.js"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"
import { Icon } from "../icons/icons.tsx"
import { Info } from "lucide-react"

type TableProps = HTMLAttributes<HTMLTableElement> & {
  maxHeight?: number | string
  overflow?: "overflow-auto" | "overflow-hidden"
  wrapperClassName?: string
}
const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, wrapperClassName, maxHeight, overflow = "overflow-auto", ...props }, ref) => (
    <div
      style={{
        maxHeight: maxHeight && typeof maxHeight === "number" ? `${maxHeight}px` : "unset",
      }}
      className={cn("flex flex-col relative w-full rounded-xl border overflow-hidden", wrapperClassName)}
    >
      <div
        className={cn("relative w-full flex-grow", overflow, {
          "custom-scrollbar min-w-full": overflow === "overflow-auto",
        })}
      >
        <table ref={ref} className={cn("w-max min-w-full caption-bottom text-sm", className)} {...props} />
      </div>
    </div>
  ),
)
Table.displayName = "Table"

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
)
TableHeader.displayName = "TableHeader"

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
)
TableBody.displayName = "TableBody"

const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & {
    verticalPadding?: boolean
    hoverable?: boolean
    borderBottom?: boolean
  }
>(({ className, verticalPadding, borderBottom = true, hoverable = true, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors data-[state=selected]:bg-secondary",
      {
        "[&>td]:py-4": verticalPadding,
        "hover:bg-secondary": hoverable,
        "border-b": borderBottom,
      },
      className,
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

type THeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  tooltipMessage?: string
}
const TableHead = forwardRef<HTMLTableCellElement, THeadProps>(({ className, tooltipMessage, ...props }, ref) => (
  <th
    ref={ref}
    className={cn("h-10 px-4 text-left align-middle font-medium bg-secondary [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  >
    <div
      className={cn("flex items-center w-full", {
        "justify-start": props.align === "left",
        "justify-center": props.align === "center",
        "justify-end": props.align === "right",
      })}
    >
      {tooltipMessage ? (
        <Tooltip
          trigger={
            <div className="flex flex-row gap-x-1 items-center">
              <Icon icon={Info} size="sm" />
              <Text.H5 weight="medium">{props.children as string}</Text.H5>
            </div>
          }
        >
          {tooltipMessage}
        </Tooltip>
      ) : typeof props.children === "string" ? (
        <Text.H5 weight="medium">{props.children}</Text.H5>
      ) : (
        props.children
      )}
    </div>
  </th>
))
TableHead.displayName = "TableHead"

type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right"
  preventDefault?: boolean
  innerClassName?: string
}
const TableCell = forwardRef<HTMLTableCellElement, CellProps>(
  ({ className, children, align = "left", preventDefault = false, onClick, innerClassName, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("px-4 align-middle [&:has([role=checkbox])]:pr-0 max-w-60", className)}
      {...props}
      onClick={(e) => {
        if (!preventDefault) return
        e.preventDefault()
        e.stopPropagation()
        onClick?.(e)
      }}
    >
      <div
        className={cn(innerClassName, "flex", {
          "justify-start": align === "left",
          "justify-center": align === "center",
          "justify-end": align === "right",
        })}
      >
        {children}
      </div>
    </td>
  ),
)
TableCell.displayName = "TableCell"

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell }
