import { savedSearchQueryIsMonitorable } from "@domain/monitors"
import { cn, PopoverContent, Text } from "@repo/ui"

/**
 * Whether a search query contains a semantic part (unquoted free text).
 * Semantic search ranks the closest traces by meaning instead of applying an
 * exact rule, so such searches can't be monitored — delegates to the same
 * `savedSearchQueryIsMonitorable` rule the server enforces.
 */
export function searchHasSemanticPart(query: string | null | undefined): boolean {
  return !savedSearchQueryIsMonitorable(query ?? null)
}

const EXACT_ENTRIES = [
  {
    label: "Literal",
    pillClassName: "border-primary/25 bg-primary/10 text-primary",
    example: '"401 Unauthorized"',
    description: "Double quotes match the exact text.",
  },
  {
    label: "Phrase",
    pillClassName: "border-phrase/30 bg-phrase/10 text-phrase-foreground",
    example: "`Refund payment failed`",
    description: "Backticks match these words in order.",
  },
] as const

/**
 * Popover body explaining why a search with a semantic part can't be
 * monitored, in the visual style of the search-syntax legend. Render inside a
 * `Popover` root with a `PopoverTrigger`.
 */
export function SemanticMonitorPopoverContent({
  align = "start",
  sideOffset = 6,
}: {
  readonly align?: "start" | "center" | "end"
  readonly sideOffset?: number
} = {}) {
  return (
    <PopoverContent align={align} sideOffset={sideOffset} className="w-80">
      <Text.H5M>This search can&apos;t be monitored</Text.H5M>
      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Text.H6B>Semantic</Text.H6B>
          <span className="inline-flex h-5 items-center rounded-full border px-2 font-mono text-[11px]">
            Checkout error
          </span>
        </div>
        <Text.H6 color="foregroundMuted">
          Plain words search by meaning: they rank the closest traces instead of applying an exact rule, so a monitor
          cannot decide which new traces match.
        </Text.H6>
      </div>
      <Text.H6M className="mt-3 block">Monitors work with exact matches:</Text.H6M>
      <ul className="mt-2 flex flex-col gap-2">
        {EXACT_ENTRIES.map((entry) => (
          <li key={entry.label} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Text.H6B>{entry.label}</Text.H6B>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px]",
                  entry.pillClassName,
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
