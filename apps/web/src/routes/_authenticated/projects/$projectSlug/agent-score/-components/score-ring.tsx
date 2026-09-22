import { Text } from "@repo/ui"
import { formatScore, formatTotalScore, type ScoreDimensionKey } from "./agent-score-format.ts"
import { DIMENSION_META } from "./dimension-meta.ts"
import { scoreColors } from "./score-colors.ts"

const circumference = (radius: number) => 2 * Math.PI * radius
const OUTER_RADIUS = 45
const INNER_RADIUS = 36
const VITALITY_STROKE_WIDTH = 4
const OUTER_HIT_STROKE_WIDTH = 14
const OUTER_IDLE_OPACITY = 0.6
const DIMMED_OPACITY = 0.2
export const DIMENSION_SEGMENT_GAP_RATIO = 0.04

interface RingDimension<Id extends string = string> {
  readonly id: Id
  readonly weight: number
  readonly score: number | null
}

type VitalityDimension = RingDimension<ScoreDimensionKey>

export type VitalityRingSection = "vitality" | ScoreDimensionKey

export interface WeightedRingSegment<Id extends string = string> extends RingDimension<Id> {
  readonly start: number
  readonly length: number
}

export const buildWeightedRingSegments = <Id extends string>(
  dimensions: readonly RingDimension<Id>[],
  ringLength: number,
  gapRatio = DIMENSION_SEGMENT_GAP_RATIO,
): WeightedRingSegment<Id>[] => {
  const weights = dimensions.map((dimension) => (Number.isFinite(dimension.weight) ? Math.max(0, dimension.weight) : 0))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const normalizedWeights = totalWeight > 0 ? weights.map((weight) => weight / totalWeight) : weights.map(() => 0)
  const gapLength = ringLength * Math.max(0, gapRatio)
  let cursor = 0

  return dimensions.map((dimension, index) => {
    const slotLength = ringLength * (normalizedWeights[index] ?? 0)
    const segmentGap = Math.min(gapLength, slotLength)
    const segment = {
      ...dimension,
      start: cursor + segmentGap / 2,
      length: Math.max(0, slotLength - segmentGap),
    }
    cursor += slotLength
    return segment
  })
}

const clampScore = (score: number): number => Math.max(0, Math.min(100, score))

const scoreColor = (score: number | null): string => scoreColors(score).className

function ProgressCircle({
  score,
  radius,
  strokeWidth = VITALITY_STROKE_WIDTH,
}: {
  readonly score: number | null
  readonly radius: number
  readonly strokeWidth?: number
}) {
  if (score === null) return null
  const length = circumference(radius)
  const progress = clampScore(score)

  return (
    <circle
      cx="50"
      cy="50"
      r={radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={`${(progress / 100) * length} ${length}`}
      transform="rotate(-90 50 50)"
      className={`transition-[stroke-width] duration-200 ease-out ${scoreColor(score)}`}
    />
  )
}

export function DimensionScoreRing({ score }: { readonly score: number | null }) {
  return (
    <div className={`relative h-14 w-14 shrink-0 ${scoreColor(score)}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
        {score !== null ? <circle cx="50" cy="50" r="36" fill="currentColor" fillOpacity={0.1} /> : null}
        <ProgressCircle score={score} radius={39} strokeWidth={6} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text.H5 weight="bold" className="tabular-nums" color="inherit">
          {score === null ? "—" : formatScore(score)}
        </Text.H5>
      </div>
    </div>
  )
}

export function VitalityScoreRing({
  score,
  dimensions,
  activeSection,
  onActiveSectionChange,
}: {
  readonly score: number | null
  readonly dimensions: readonly VitalityDimension[]
  readonly activeSection: VitalityRingSection | null
  readonly onActiveSectionChange: (section: VitalityRingSection | null) => void
}) {
  const outerLength = circumference(OUTER_RADIUS)
  const segments = buildWeightedRingSegments(dimensions, outerLength)
  const hitSegments = buildWeightedRingSegments(dimensions, outerLength, 0)
  const activeDimension = activeSection && activeSection !== "vitality" ? activeSection : null
  const displayedScore = score
  const innerOpacity = activeDimension ? DIMMED_OPACITY : 1

  return (
    <div className="relative h-44 w-44 shrink-0">
      {/* biome-ignore lint/a11y/useSemanticElements: SVG groups cannot contain an HTML fieldset. */}
      <svg
        viewBox="0 0 100 100"
        role="group"
        aria-label="Agent vitality and dimension scores"
        className="h-full w-full"
        onPointerLeave={() => onActiveSectionChange(null)}
      >
        {score !== null ? (
          <circle
            cx="50"
            cy="50"
            r={INNER_RADIUS - VITALITY_STROKE_WIDTH / 2}
            fill="currentColor"
            fillOpacity={0.1}
            className={scoreColor(score)}
            pointerEvents="none"
          />
        ) : null}
        {segments.map((segment) => {
          const active = activeDimension === segment.id
          const opacity = activeDimension ? (active ? 1 : DIMMED_OPACITY) : OUTER_IDLE_OPACITY
          return (
            <g
              key={segment.id}
              opacity={opacity}
              pointerEvents="none"
              className="transition-opacity duration-200 ease-out"
              data-ring-segment={segment.id}
            >
              {segment.score !== null && segment.length > 0 ? (
                <circle
                  cx="50"
                  cy="50"
                  r={OUTER_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={VITALITY_STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={`${segment.length} ${outerLength - segment.length}`}
                  strokeDashoffset={-segment.start}
                  transform="rotate(-90 50 50)"
                  className={`transition-[stroke-width] duration-200 ease-out ${scoreColor(segment.score)}`}
                />
              ) : null}
            </g>
          )
        })}
        <g
          opacity={innerOpacity}
          pointerEvents="none"
          className="transition-opacity duration-200 ease-out"
          data-ring-segment="vitality"
        >
          {score === null ? null : (
            <ProgressCircle score={score} radius={INNER_RADIUS} strokeWidth={VITALITY_STROKE_WIDTH} />
          )}
        </g>
        {hitSegments.map((segment) => (
          // biome-ignore lint/a11y/useSemanticElements: SVG hit areas need their own focus targets.
          <circle
            key={`${segment.id}-hit-area`}
            cx="50"
            cy="50"
            r={OUTER_RADIUS}
            fill="none"
            stroke="transparent"
            strokeWidth={OUTER_HIT_STROKE_WIDTH}
            strokeDasharray={`${segment.length} ${outerLength - segment.length}`}
            strokeDashoffset={-segment.start}
            transform="rotate(-90 50 50)"
            pointerEvents="stroke"
            data-ring-hit-area={segment.id}
            tabIndex={0}
            role="button"
            aria-label={`${DIMENSION_META[segment.id].title}: ${segment.score === null ? "not ready" : formatScore(segment.score)}`}
            onFocus={() => onActiveSectionChange(segment.id)}
            onBlur={() => onActiveSectionChange(null)}
            onPointerEnter={() => onActiveSectionChange(segment.id)}
          />
        ))}
        {/* biome-ignore lint/a11y/useSemanticElements: SVG hit areas need their own focus targets. */}
        <circle
          cx="50"
          cy="50"
          r={INNER_RADIUS + VITALITY_STROKE_WIDTH / 2}
          fill="transparent"
          pointerEvents="fill"
          data-ring-hit-area="vitality"
          tabIndex={0}
          role="button"
          aria-label={`Agent vitality: ${score === null ? "not ready" : formatTotalScore(score)}`}
          onFocus={() => onActiveSectionChange("vitality")}
          onBlur={() => onActiveSectionChange(null)}
          onPointerEnter={() => onActiveSectionChange("vitality")}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Text.H2 weight="bold" className="tabular-nums" color="foreground">
          {displayedScore === null ? "—" : formatTotalScore(displayedScore)}
        </Text.H2>
        <Text.H6 color="foregroundMuted">Agent vitality</Text.H6>
      </div>
    </div>
  )
}
