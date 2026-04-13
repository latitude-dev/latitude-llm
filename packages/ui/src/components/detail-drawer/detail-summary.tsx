import type { ReactNode } from "react"
import { CopyButton } from "../copy-button/index.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"

export type DetailSummaryItem = {
  readonly label: string
  readonly isLoading?: boolean
  readonly value: ReactNode | undefined
  readonly copyable?: boolean
}

/** Trims display/copy text; API strings are normalized when read from ClickHouse. */
function normalizeCopyableScalar(value: ReactNode): string {
  if (typeof value !== "string") return ""
  return value.trim()
}

function hasCopyableDisplayValue(value: ReactNode): boolean {
  return normalizeCopyableScalar(value).length > 0
}

function SummaryItemContent({
  value,
  isLoading,
  copyable,
}: {
  value: ReactNode
  isLoading: boolean
  copyable: boolean
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-24 inline-block" />
  }

  // If value is null/undefined, show "-"
  if (value === null || value === undefined) {
    return <Text.H5 color="foreground">-</Text.H5>
  }

  // If value is a React element (not a string/number), render it wrapped in H5 for consistent styling
  if (typeof value === "object") {
    return <Text.H5 color="foreground">{value}</Text.H5>
  }

  const normalized = normalizeCopyableScalar(value)

  if (copyable && normalized.length > 0) {
    return (
      <div className="flex flex-row items-center gap-1">
        <Text.H5 color="foreground">{normalized}</Text.H5>
        <CopyButton value={normalized} />
      </div>
    )
  }

  return <Text.H5 color="foreground">{normalized.length > 0 ? normalized : "-"}</Text.H5>
}

function SummaryItem({ label, value, isLoading, copyable }: DetailSummaryItem) {
  if (!isLoading && copyable && typeof value === "string" && !hasCopyableDisplayValue(value)) {
    return null
  }

  return (
    <div className="flex flex-col gap-0 min-w-[120px]">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <SummaryItemContent value={value} isLoading={isLoading ?? false} copyable={copyable ?? false} />
    </div>
  )
}

export function DetailSummary({ items }: { readonly items: readonly DetailSummaryItem[] }) {
  return (
    <div className="flex flex-row flex-wrap gap-4">
      {items.map((item) => (
        <SummaryItem key={item.label} {...item} />
      ))}
    </div>
  )
}
