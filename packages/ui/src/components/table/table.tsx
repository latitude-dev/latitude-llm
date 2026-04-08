import { Info } from "lucide-react"
import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  useContext,
} from "react"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

export type TableVariant = "default" | "listing"

const TableVariantContext = createContext<TableVariant>("default")

function useTableVariant(): TableVariant {
  return useContext(TableVariantContext)
}

/** Distinguishes header vs body rows so listing styling does not paint `bg-secondary` on `<thead>` rows. */
const TableSectionContext = createContext<"head" | "body">("body")

function useTableSection(): "head" | "body" {
  return useContext(TableSectionContext)
}

type TableProps = HTMLAttributes<HTMLTableElement> & {
  maxHeight?: number | string
  overflow?: "overflow-auto" | "overflow-hidden"
  wrapperClassName?: string
  /** `listing` matches InfiniteTable / traces: row gaps, rounded rows, muted H6 headers, no outer card border. */
  variant?: TableVariant
}
const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { className, wrapperClassName, maxHeight, overflow = "overflow-auto", variant = "default", ...props },
  ref,
) {
  const isListing = variant === "listing"
  return (
    <TableVariantContext.Provider value={variant}>
      <div
        style={{
          maxHeight: maxHeight && typeof maxHeight === "number" ? `${maxHeight}px` : "unset",
        }}
        className={cn(
          "relative flex w-full flex-col",
          isListing ? "overflow-visible" : "overflow-hidden rounded-xl border",
          wrapperClassName,
        )}
      >
        <div
          className={cn("relative w-full grow", overflow, {
            "custom-scrollbar min-w-full": overflow === "overflow-auto",
            "overflow-x-auto": isListing && overflow === "overflow-auto",
          })}
        >
          <table
            ref={ref}
            className={cn(
              "caption-bottom min-w-full text-sm",
              isListing && "w-max min-w-full border-separate border-spacing-y-1",
              !isListing && "w-max min-w-full",
              className,
            )}
            {...props}
          />
        </div>
      </div>
    </TableVariantContext.Provider>
  )
})
Table.displayName = "Table"

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => {
    const variant = useTableVariant()
    const isListing = variant === "listing"
    return (
      <thead
        ref={ref}
        className={cn(
          isListing ? "sticky top-0 z-10 border-b border-border bg-transparent [&_tr]:border-0" : "[&_tr]:border-b",
          className,
        )}
        {...props}
      >
        <TableSectionContext.Provider value="head">{children}</TableSectionContext.Provider>
      </thead>
    )
  },
)
TableHeader.displayName = "TableHeader"

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => {
    const variant = useTableVariant()
    return (
      <tbody ref={ref} className={cn(variant === "listing" ? "" : "[&_tr:last-child]:border-0", className)} {...props}>
        <TableSectionContext.Provider value="body">{children}</TableSectionContext.Provider>
      </tbody>
    )
  },
)
TableBody.displayName = "TableBody"

const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement> & {
    verticalPadding?: boolean
    hoverable?: boolean
    borderBottom?: boolean
  }
>(({ className, verticalPadding, borderBottom = true, hoverable = true, ...props }, ref) => {
  const variant = useTableVariant()
  const section = useTableSection()
  const isListing = variant === "listing"
  const isListingHeaderRow = isListing && section === "head"
  const isListingBodyRow = isListing && section === "body"
  return (
    <tr
      ref={ref}
      className={cn(
        "transition-colors data-[state=selected]:bg-secondary",
        isListingHeaderRow && "bg-transparent",
        isListingBodyRow && cn("bg-secondary", hoverable && "hover:bg-muted"),
        !isListing && {
          "[&>td]:py-4": verticalPadding,
          "hover:bg-secondary": hoverable,
          "border-b": borderBottom,
        },
        className,
      )}
      {...props}
    />
  )
})
TableRow.displayName = "TableRow"

type THeadProps = ThHTMLAttributes<HTMLTableCellElement> & {
  tooltipMessage?: string
}
const TableHead = forwardRef<HTMLTableCellElement, THeadProps>(
  ({ className, tooltipMessage, children, align = "left", ...props }, ref) => {
    const variant = useTableVariant()
    const isListing = variant === "listing"
    const stringLabel =
      typeof children === "string" ? (
        isListing ? (
          <Text.H6 weight="medium" color="foregroundMuted">
            {children}
          </Text.H6>
        ) : (
          <Text.H5 weight="medium">{children}</Text.H5>
        )
      ) : null

    return (
      <th
        ref={ref}
        className={cn(
          "px-4 text-left align-middle [&:has([role=checkbox])]:pr-0",
          isListing ? "h-12 bg-transparent font-normal" : "h-10 bg-secondary font-medium",
          className,
        )}
        {...props}
      >
        <div
          className={cn("flex w-full items-center", {
            "justify-start": align === "left",
            "justify-center": align === "center",
            "justify-end": align === "right",
          })}
        >
          {tooltipMessage ? (
            <Tooltip
              trigger={
                <div className="flex flex-row items-center gap-x-1">
                  <Icon icon={Info} size="sm" />
                  {isListing ? (
                    <Text.H6 weight="medium" color="foregroundMuted">
                      {children as string}
                    </Text.H6>
                  ) : (
                    <Text.H5 weight="medium">{children as string}</Text.H5>
                  )}
                </div>
              }
            >
              {tooltipMessage}
            </Tooltip>
          ) : typeof children === "string" ? (
            stringLabel
          ) : (
            (children ?? null)
          )}
        </div>
      </th>
    )
  },
)
TableHead.displayName = "TableHead"

type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right"
  preventDefault?: boolean
  innerClassName?: string
}
const TableCell = forwardRef<HTMLTableCellElement, CellProps>(
  ({ className, children, align = "left", preventDefault = false, onClick, innerClassName, ...props }, ref) => {
    const variant = useTableVariant()
    const isListing = variant === "listing"
    return (
      <td
        ref={ref}
        className={cn(
          "px-4 align-middle [&:has([role=checkbox])]:pr-0",
          isListing ? "max-w-0 overflow-hidden py-2 first:rounded-l-lg last:rounded-r-lg" : "max-w-60",
          className,
        )}
        {...props}
        onClick={(e) => {
          if (!preventDefault) return
          e.preventDefault()
          e.stopPropagation()
          onClick?.(e)
        }}
        onKeyDown={(e) => {
          if (!preventDefault || !onClick) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick(e as unknown as React.MouseEvent<HTMLTableCellElement>)
          }
        }}
      >
        <div
          className={cn(innerClassName, "flex min-w-0", isListing && "items-center", {
            "justify-start": align === "left",
            "justify-center": align === "center",
            "justify-end": align === "right",
          })}
        >
          {children}
        </div>
      </td>
    )
  },
)
TableCell.displayName = "TableCell"

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell }
