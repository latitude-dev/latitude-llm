import { cn, EmptyState, Skeleton, Text } from "@repo/ui"
import { useState } from "react"
import { ValueBar } from "./value-bar.tsx"

const COLLAPSED_COUNT = 5

export interface StoreInsightItem {
  readonly key: string
  readonly label: string
  readonly value: string
  /** 0..1 magnitude for the inline bar, normalized to the list's top value. */
  readonly fraction: number
  /** When set, the row navigates to this record; otherwise it renders static. */
  readonly recordId?: string
}

export function StoreInsightList({
  title,
  items,
  isLoading,
  emptyText,
  mono = false,
  tone = "primary",
  onSelectRecord,
}: {
  readonly title: string
  readonly items: readonly StoreInsightItem[]
  readonly isLoading: boolean
  readonly emptyText: string
  readonly mono?: boolean
  readonly tone?: "primary" | "destructive"
  readonly onSelectRecord?: (recordId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT)

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
      <Text.H6 color="foregroundMuted">{title}</Text.H6>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState message={emptyText} />
      ) : (
        <>
          <div className={cn("flex min-h-0 flex-col gap-2", expanded && "max-h-72 overflow-y-auto")}>
            {visible.map((item) => (
              <StoreInsightRow key={item.key} item={item} mono={mono} tone={tone} onSelectRecord={onSelectRecord} />
            ))}
          </div>
          {items.length > COLLAPSED_COUNT ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="self-start text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Text.H6 color="primary">{expanded ? "Show less" : `Show all ${items.length}`}</Text.H6>
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

function StoreInsightRow({
  item,
  mono,
  tone,
  onSelectRecord,
}: {
  readonly item: StoreInsightItem
  readonly mono: boolean
  readonly tone: "primary" | "destructive"
  readonly onSelectRecord: ((recordId: string) => void) | undefined
}) {
  const clickable = item.recordId !== undefined && onSelectRecord !== undefined
  const body = (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 flex-row items-center gap-2">
        <Text.H6 color="foreground" className={cn("min-w-0 flex-1 truncate", mono && "font-mono")}>
          {item.label}
        </Text.H6>
        <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
          {item.value}
        </Text.H6>
      </div>
      <ValueBar fraction={item.fraction} tone={tone} />
    </div>
  )

  if (!clickable) return body
  return (
    <button
      type="button"
      onClick={() => onSelectRecord(item.recordId as string)}
      className="rounded text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {body}
    </button>
  )
}
