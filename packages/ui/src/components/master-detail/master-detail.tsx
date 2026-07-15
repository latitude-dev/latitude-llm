import type { ReactNode } from "react"
import { useState } from "react"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"

export type MasterDetailItem = {
  readonly key: string
  readonly label: ReactNode
  readonly trailing?: ReactNode
}

export type MasterDetailProps = {
  readonly items: readonly MasterDetailItem[]
  readonly renderDetail: (key: string) => ReactNode
  readonly header?: ReactNode
  readonly emptyState?: ReactNode
  /** Controlled selection. Omit for uncontrolled (defaults to `defaultSelectedKey` or the first item). */
  readonly selectedKey?: string
  readonly onSelectKey?: (key: string) => void
  readonly defaultSelectedKey?: string
  readonly className?: string
  readonly railClassName?: string
  readonly detailClassName?: string
}

/**
 * Two-pane list + content layout: a selectable rail on the left, the selected item's detail on the right.
 * Selection is uncontrolled unless `selectedKey` is passed.
 */
export function MasterDetail({
  items,
  renderDetail,
  header,
  emptyState,
  selectedKey,
  onSelectKey,
  defaultSelectedKey,
  className,
  railClassName,
  detailClassName,
}: MasterDetailProps) {
  const isControlled = selectedKey !== undefined
  const [internalKey, setInternalKey] = useState(defaultSelectedKey ?? items[0]?.key)

  const desiredKey = isControlled ? selectedKey : internalKey
  const activeKey = items.some((item) => item.key === desiredKey) ? desiredKey : items[0]?.key

  function select(key: string) {
    if (!isControlled) setInternalKey(key)
    onSelectKey?.(key)
  }

  if (items.length === 0) {
    return <div className={cn("rounded-md border border-border p-3", className)}>{emptyState}</div>
  }

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border border-border", className)}>
      {header ? <div className="shrink-0 border-b border-border">{header}</div> : null}
      <div className="flex min-h-0 flex-1 flex-row">
        <div
          className={cn(
            "flex w-1/3 min-w-[7rem] max-w-[16rem] shrink-0 flex-col overflow-y-auto border-r border-border",
            railClassName,
          )}
        >
          {items.map((item) => {
            const isSelected = item.key === activeKey
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => select(item.key)}
                className={cn("flex flex-row items-center gap-2 px-3 py-2 text-left transition-colors", {
                  "bg-accent": isSelected,
                  "hover:bg-muted/50": !isSelected,
                })}
              >
                <div className="flex min-w-0 flex-1">
                  {typeof item.label === "string" ? (
                    <Text.H6 ellipsis noWrap color={isSelected ? "foreground" : "foregroundMuted"}>
                      {item.label}
                    </Text.H6>
                  ) : (
                    item.label
                  )}
                </div>
                {item.trailing ? <div className="shrink-0">{item.trailing}</div> : null}
              </button>
            )
          })}
        </div>
        <div className={cn("min-w-0 flex-1 overflow-y-auto p-3", detailClassName)}>
          {activeKey !== undefined ? renderDetail(activeKey) : null}
        </div>
      </div>
    </div>
  )
}
