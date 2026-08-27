import { cn, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { BAND_TEXT, formatScore, scoreBand } from "./score-formatters.ts"

const VIEW_WIDTH = 100
const VIEW_HEIGHT = 32

/** Daily frozen snapshots. Inline SVG rather than echarts: it inherits the theme's text colour. */
export function ScoreSparkline({
  history,
  className,
}: {
  readonly history: readonly { readonly day: string; readonly score: number }[]
  readonly className?: string
}) {
  if (history.length < 2) return null

  const scores = history.map((point) => point.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const spread = max - min || 1
  const x = (index: number) => (index / (history.length - 1)) * VIEW_WIDTH
  const y = (score: number) => VIEW_HEIGHT - ((score - min) / spread) * (VIEW_HEIGHT - 4) - 2
  const line = history.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.score)}`).join(" ")
  const area = `${line} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`
  const last = history[history.length - 1] as { readonly day: string; readonly score: number }
  const band = scoreBand(last.score)

  return (
    <TooltipProvider>
      <TooltipRoot delayDuration={100}>
        <TooltipTrigger asChild>
          <div className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}>
            <svg
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
              className={cn("h-10 w-full", BAND_TEXT[band])}
              role="img"
              aria-label="Score over recent days"
            >
              <path d={area} fill="currentColor" opacity={0.18} />
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex flex-row items-center justify-between">
              <Text.H6 color="foregroundMuted">{history[0]?.day}</Text.H6>
              <Text.H6 color="foregroundMuted">{last.day}</Text.H6>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="flex flex-col gap-0.5">
            <Text.H6>One frozen score per day</Text.H6>
            <Text.H6 color="foregroundMuted">
              {formatScore(min)} to {formatScore(max)} across {history.length} days
            </Text.H6>
          </div>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
