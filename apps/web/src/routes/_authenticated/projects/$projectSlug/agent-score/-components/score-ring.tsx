import { Text } from "@repo/ui"
import { formatScore, type ScoreDimensionKey } from "./agent-score-format.ts"

const circumference = (radius: number) => 2 * Math.PI * radius
const OUTER_RADIUS = 45
const INNER_RADIUS = 36
const OUTER_STROKE_WIDTH = 5
const OUTER_ACTIVE_STROKE_WIDTH = 7
const OUTER_HIT_STROKE_WIDTH = 14
const INNER_STROKE_WIDTH = 5
const INNER_ACTIVE_STROKE_WIDTH = 7
const OUTER_IDLE_OPACITY = 0.5
const DIMMED_OPACITY = 0.2
const OUTER_TRACK_OPACITY = 0.22
const INNER_TRACK_OPACITY = 0.16
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

const vitalityScoreColor = (score: number): string => {
  const value = clampScore(score)
  if (value <= 50) {
    return `color-mix(in oklch, hsl(var(--viz-red)) ${100 - value * 2}%, hsl(var(--viz-gold-soft)))`
  }
  return `color-mix(in oklch, hsl(var(--viz-gold-soft)) ${200 - value * 2}%, hsl(var(--viz-green)))`
}

const scoreColor = (score: number | null): string => {
  if (score === null) return "text-muted-foreground"
  if (score < 60) return "text-[hsl(var(--viz-red))]"
  if (score < 80) return "text-[hsl(var(--viz-gold-soft))]"
  return "text-[hsl(var(--viz-green))]"
}

function ProgressCircle({
  score,
  radius,
  strokeWidth = INNER_STROKE_WIDTH,
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
      className="transition-[stroke-width] duration-200 ease-out"
    />
  )
}

export function DimensionScoreRing({ score }: { readonly score: number | null }) {
  return (
    <div className={`relative h-14 w-14 shrink-0 ${scoreColor(score)}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
        <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="5" />
        <ProgressCircle score={score} radius={39} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text.H6B className="tabular-nums" color="inherit">
          {score === null ? "—" : formatScore(score)}
        </Text.H6B>
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
  const displayedScore = activeDimension
    ? (dimensions.find((dimension) => dimension.id === activeDimension)?.score ?? null)
    : score
  const innerOpacity = activeDimension ? DIMMED_OPACITY : 1

  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="h-full w-full"
        onPointerLeave={() => onActiveSectionChange(null)}
      >
        {segments.map((segment) => {
          const active = activeDimension === segment.id
          const opacity = activeDimension ? (active ? 1 : DIMMED_OPACITY) : OUTER_IDLE_OPACITY
          const strokeWidth = active ? OUTER_ACTIVE_STROKE_WIDTH : OUTER_STROKE_WIDTH
          const progressLength = segment.score === null ? 0 : segment.length * (clampScore(segment.score) / 100)
          return (
            <g
              key={segment.id}
              opacity={opacity}
              pointerEvents="none"
              className="transition-opacity duration-200 ease-out"
              data-ring-segment={segment.id}
            >
              <circle
                cx="50"
                cy="50"
                r={OUTER_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeOpacity={OUTER_TRACK_OPACITY}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${segment.length} ${outerLength - segment.length}`}
                strokeDashoffset={-segment.start}
                transform="rotate(-90 50 50)"
                className="text-muted-foreground transition-[stroke-width] duration-200 ease-out"
              />
              {segment.score !== null && progressLength > 0 ? (
                <circle
                  cx="50"
                  cy="50"
                  r={OUTER_RADIUS}
                  fill="none"
                  stroke={vitalityScoreColor(segment.score)}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${progressLength} ${outerLength - progressLength}`}
                  strokeDashoffset={-segment.start}
                  transform="rotate(-90 50 50)"
                  className="transition-[stroke-width] duration-200 ease-out"
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
          <circle
            cx="50"
            cy="50"
            r={INNER_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={INNER_TRACK_OPACITY}
            strokeWidth={activeSection === "vitality" ? INNER_ACTIVE_STROKE_WIDTH : INNER_STROKE_WIDTH}
            className="text-muted-foreground transition-[stroke-width] duration-200 ease-out"
          />
          {score === null ? null : (
            <g style={{ color: vitalityScoreColor(score) }}>
              <ProgressCircle
                score={score}
                radius={INNER_RADIUS}
                strokeWidth={activeSection === "vitality" ? INNER_ACTIVE_STROKE_WIDTH : INNER_STROKE_WIDTH}
              />
            </g>
          )}
        </g>
        {hitSegments.map((segment) => (
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
            onPointerEnter={() => onActiveSectionChange(segment.id)}
          />
        ))}
        <circle
          cx="50"
          cy="50"
          r={INNER_RADIUS + INNER_STROKE_WIDTH / 2}
          fill="transparent"
          pointerEvents="fill"
          data-ring-hit-area="vitality"
          onPointerEnter={() => onActiveSectionChange("vitality")}
        />
      </svg>
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-colors duration-200 ease-out ${displayedScore === null ? "text-muted-foreground" : ""}`}
        style={displayedScore === null ? undefined : { color: vitalityScoreColor(displayedScore) }}
      >
        <Text.H3M className="tabular-nums" color="inherit">
          {displayedScore === null ? "—" : displayedScore.toFixed(1)}
        </Text.H3M>
      </div>
    </div>
  )
}
