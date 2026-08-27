import { cn, Text, useMountEffect } from "@repo/ui"
import { useState } from "react"
import { BAND_TEXT, DASH, formatScore, scoreBand } from "./score-formatters.ts"

const RING_SIZE = 132
const RING_STROKE = 8
const RADIUS = (RING_SIZE - RING_STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ScoreRing({ score }: { readonly score: number | null }) {
  const [drawn, setDrawn] = useState(false)
  useMountEffect(() => setDrawn(true))

  const band = score === null ? null : scoreBand(score)
  const filled = score === null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * CIRCUMFERENCE

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className={cn("-rotate-90", band === null ? "text-muted-foreground" : BAND_TEXT[band])}
        role="img"
        aria-label={score === null ? "Score not available yet" : `Score ${formatScore(score)} out of 100`}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-muted"
          {...(score === null ? { strokeDasharray: "4 6" } : {})}
        />
        {score === null ? null : (
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - (drawn ? filled : 0)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Text.H1
          weight="semibold"
          className={cn("tabular-nums", band === null ? "text-muted-foreground" : BAND_TEXT[band])}
        >
          {score === null ? DASH : formatScore(score)}
        </Text.H1>
      </div>
    </div>
  )
}
