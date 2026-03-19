import { CheckIcon, CopyIcon } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"

export type DetailSummaryItem = {
  readonly label: string
  readonly isLoading?: boolean
  readonly value: string | undefined
  readonly copyable?: boolean
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
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  })

  const handleCopy = useCallback(() => {
    if (copyable && value) {
      navigator.clipboard.writeText(value)
      setIsCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setIsCopied(false), 2000)
    }
  }, [value, copyable])

  if (isLoading) {
    return <Skeleton className="h-4 w-24 inline-block" />
  }

  if (copyable && value) {
    return (
      <button
        type="button"
        className={cn("flex flex-row items-center gap-2", { "cursor-pointer hover:text-primary": copyable })}
        onClick={handleCopy}
      >
        <Text.H5 color="foreground">{value}</Text.H5>
        <Icon icon={isCopied ? CheckIcon : CopyIcon} size="sm" />
      </button>
    )
  }

  return <Text.H5 color="foreground">{value || "-"}</Text.H5>
}

function SummaryItem({ label, value, isLoading, copyable }: DetailSummaryItem) {
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
