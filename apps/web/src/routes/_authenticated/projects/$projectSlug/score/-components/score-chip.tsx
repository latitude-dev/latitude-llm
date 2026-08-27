import { cn, Text } from "@repo/ui"
import { BAND_SURFACE, BAND_TEXT, DASH, formatScore, scoreBand } from "./score-formatters.ts"

/** `lg` matches the height of a two-line title in a section header; `sm` fits a summary row. */
export function ScoreChip({
  score,
  label,
  size = "sm",
}: {
  readonly score: number | null
  readonly label?: string
  readonly size?: "sm" | "lg"
}) {
  const box = size === "lg" ? "h-12 min-w-[68px]" : "h-8 min-w-16"
  const band = score === null ? null : scoreBand(score)

  if (band === null) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center rounded-md bg-muted px-2", box)}>
        <Text.H5 color="foregroundMuted" className="tabular-nums">
          {label ?? DASH}
        </Text.H5>
      </div>
    )
  }
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-md px-2", box, BAND_SURFACE[band])}>
      {size === "lg" ? (
        <Text.H3M className={cn("tabular-nums", BAND_TEXT[band])}>{formatScore(score)}</Text.H3M>
      ) : (
        <Text.H4M className={cn("tabular-nums", BAND_TEXT[band])}>{formatScore(score)}</Text.H4M>
      )}
    </div>
  )
}
