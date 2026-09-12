import { Text, Tooltip } from "@repo/ui"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import {
  DIMENSION_LABEL,
  DIMENSION_MEANING,
  dimensionOf,
  formatInterval,
  formatPercent,
  formatScore,
  oneSessionSuccessRate,
  SCORE_DIMENSION_ORDER,
  type ScoreDimensionKey,
} from "./agent-score-format.ts"

/**
 * Reliability never appears as its twenty-session number alone.
 *
 * 36 looks like a failing grade until you know it is the chance of twenty consecutive sessions
 * completing, which a 95% per-session success rate produces. The rate is the number a reader can
 * actually judge, so it travels with the score everywhere the score goes.
 */
const nativeReading = (dimension: ScoreDimensionKey, score: number): string | null =>
  dimension === "reliability" ? `${formatPercent(oneSessionSuccessRate(score))} one-session success` : null

export function DimensionStrip({ snapshot }: { readonly snapshot: AgentScoreRecord }) {
  return (
    <div className="flex flex-row gap-6 overflow-x-auto pb-1">
      {SCORE_DIMENSION_ORDER.map((dimension) => {
        const entry = dimensionOf(snapshot, dimension)
        if (!entry) return null
        const native = nativeReading(dimension, entry.score)
        return (
          <div key={dimension} className="flex basis-[196px] min-w-[196px] shrink-0 flex-col gap-2">
            <Tooltip
              asChild
              trigger={
                <span className="w-max cursor-default">
                  <Text.H6 color="foregroundMuted">{DIMENSION_LABEL[dimension]}</Text.H6>
                </span>
              }
            >
              {DIMENSION_MEANING[dimension]}
            </Tooltip>
            <Text.H5 color="foreground" className="tabular-nums">
              {formatScore(entry.score)}
            </Text.H5>
            <div className="flex flex-col gap-0.5">
              {native ? <Text.H6 color="foregroundMuted">{native}</Text.H6> : null}
              <Text.H6 color="foregroundMuted" className="tabular-nums">
                {formatInterval(entry.interval)}
              </Text.H6>
            </div>
          </div>
        )
      })}
    </div>
  )
}
