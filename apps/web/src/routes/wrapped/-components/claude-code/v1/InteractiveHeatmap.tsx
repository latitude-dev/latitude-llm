import type { WrappedReportRecord } from "@domain/spans"
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"

interface InteractiveHeatmapProps {
  readonly heatmap: WrappedReportRecord["report"]["heatmap"]
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
const ACCENT_RGB = [217, 117, 85] as const // #D97555
const CREAM_RGB = [232, 228, 216] as const // #E8E4D8

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

/** Interpolates between cream (0 calls) and the orange accent (max calls). */
const cellColor = (count: number, max: number): string => {
  if (max <= 0 || count <= 0) return `rgb(${CREAM_RGB.join(",")})`
  const t = Math.min(1, count / max)
  const r = lerp(CREAM_RGB[0], ACCENT_RGB[0], t)
  const g = lerp(CREAM_RGB[1], ACCENT_RGB[1], t)
  const b = lerp(CREAM_RGB[2], ACCENT_RGB[2], t)
  return `rgb(${r},${g},${b})`
}

const formatHour = (hour: number): string => {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(hour)}:00 – ${pad((hour + 1) % 24)}:00 UTC`
}

/**
 * 7×24 grid (Mon..Sun rows, 0..23 UTC columns). Each cell is hover-anchored
 * to a Radix Tooltip showing the day name, hour range, and tool-call count.
 *
 * Cell intensity is interpolated from the cream background to the orange
 * accent, clamped to the week's max so even modest weeks have visible
 * contrast.
 */
export function InteractiveHeatmap({ heatmap }: InteractiveHeatmapProps) {
  let max = 0
  for (const row of heatmap) {
    for (const v of row) if (v > max) max = v
  }
  if (max === 0) return null

  return (
    <TooltipProvider delayDuration={120}>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: "3px" }}>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, hour) => (
                <th
                  key={hour}
                  className="pb-1 text-[10px] font-normal"
                  style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
                >
                  {hour % 3 === 0 ? hour : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.map((row, dayIdx) => (
              <tr key={DAY_NAMES[dayIdx]}>
                <td className="pr-2 text-right text-[11px]" style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}>
                  {DAY_NAMES[dayIdx]}
                </td>
                {row.map((count, hour) => (
                  <td key={hour}>
                    <TooltipRoot>
                      <TooltipTrigger asChild>
                        <div
                          className="h-4 w-4 cursor-pointer rounded-[3px] sm:h-5 sm:w-5"
                          style={{ backgroundColor: cellColor(count, max) }}
                          role="img"
                          aria-label={`${DAY_NAMES[dayIdx]} ${formatHour(hour)}, ${count} tool calls`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        <div className="text-xs">
                          <div className="font-medium">{`${DAY_NAMES[dayIdx]} · ${formatHour(hour)}`}</div>
                          <div>{`${count.toLocaleString("en-US")} tool call${count === 1 ? "" : "s"}`}</div>
                        </div>
                      </TooltipContent>
                    </TooltipRoot>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
