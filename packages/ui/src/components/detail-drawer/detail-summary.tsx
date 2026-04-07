import { CopyButton } from "../copy-button/index.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"

export type DetailSummaryItem = {
  readonly label: string
  readonly isLoading?: boolean
  readonly value: string | undefined
  readonly copyable?: boolean
}

/** Trims display/copy text; API strings are normalized when read from ClickHouse. */
function normalizeCopyableScalar(value: string | undefined): string {
  if (typeof value !== "string") return ""
  return value.trim()
}

function hasCopyableDisplayValue(value: string | undefined): boolean {
  return normalizeCopyableScalar(value).length > 0
}

function SummaryItemContent({
  value,
  isLoading,
  copyable,
}: {
  value: string | undefined
  isLoading: boolean
  copyable: boolean
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-24 inline-block" />
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
  if (!isLoading && copyable && !hasCopyableDisplayValue(value)) {
    return null
  }

  return (
    <div className="flex flex-col gap-0.5 min-w-[120px]">
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
