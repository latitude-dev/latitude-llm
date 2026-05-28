import { Button, cn, Icon, Popover, PopoverContent, PopoverTrigger, Text } from "@repo/ui"
import { CircleHelpIcon } from "lucide-react"

type Entry = {
  readonly label: string
  readonly pillClassName?: string
  readonly example: string
  readonly description: string
}

const ENTRIES: readonly Entry[] = [
  {
    label: "Semantic",
    example: "checkout error",
    description: "Plain words search by meaning. Results don't need to contain the exact text.",
  },
  {
    label: "Literal",
    pillClassName: "border-primary/25 bg-primary/10 text-primary",
    example: '"401 Unauthorized"',
    description: "Wrap in double quotes for an exact match, including capitalization and punctuation.",
  },
  {
    label: "Phrase",
    pillClassName: "border-phrase/30 bg-phrase/10 text-phrase-foreground",
    example: "`refund payment failed`",
    description: "Wrap in backticks to match these words in this order. Capitalization is ignored.",
  },
]

export function SearchSyntaxLegendContent({
  align = "end",
  sideOffset = 6,
  onCloseAutoFocus,
}: {
  readonly align?: "start" | "center" | "end"
  readonly sideOffset?: number
  readonly onCloseAutoFocus?: (event: Event) => void
} = {}) {
  return (
    <PopoverContent align={align} sideOffset={sideOffset} className="w-80" onCloseAutoFocus={onCloseAutoFocus}>
      <Text.H5M>Search syntax</Text.H5M>
      <ul className="mt-3 flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <li key={entry.label} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Text.H6B>{entry.label}</Text.H6B>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px]",
                  entry.pillClassName ?? "text-muted-foreground",
                )}
              >
                {entry.example}
              </span>
            </div>
            <Text.H6 color="foregroundMuted">{entry.description}</Text.H6>
          </li>
        ))}
      </ul>
    </PopoverContent>
  )
}

export function SearchSyntaxLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Search syntax help">
          <Icon icon={CircleHelpIcon} size="sm" color="foregroundMuted" />
        </Button>
      </PopoverTrigger>
      <SearchSyntaxLegendContent />
    </Popover>
  )
}
