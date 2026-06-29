import { Button, Icon, Text, Tooltip } from "@repo/ui"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

export function SearchMatchNavigator({
  activeIndex,
  matchCount,
  onPrevious,
  onNext,
}: {
  readonly activeIndex: number
  readonly matchCount: number
  readonly onPrevious: () => void
  readonly onNext: () => void
}) {
  if (matchCount === 0) return null

  const positionLabel = `${activeIndex + 1} / ${matchCount}`
  const canGoUp = activeIndex > 0
  const canGoDown = activeIndex < matchCount - 1

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Text.H6 color="foregroundMuted" className="min-w-[3.25rem] text-right tabular-nums">
        {positionLabel}
      </Text.H6>
      <Tooltip
        side="bottom"
        asChild
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-input bg-background shadow-sm hover:bg-secondary"
            disabled={!canGoUp}
            aria-label="Previous match"
            onClick={onPrevious}
          >
            <Icon icon={ChevronUpIcon} size="sm" />
          </Button>
        }
      >
        Previous match
      </Tooltip>
      <Tooltip
        side="bottom"
        asChild
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-input bg-background shadow-sm hover:bg-secondary"
            disabled={!canGoDown}
            aria-label="Next match"
            onClick={onNext}
          >
            <Icon icon={ChevronDownIcon} size="sm" />
          </Button>
        }
      >
        Next match
      </Tooltip>
    </div>
  )
}
