import { useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"

interface StagedStatusStage {
  readonly atSeconds: number
  readonly label: string
}

export function selectStage(stages: ReadonlyArray<StagedStatusStage>, elapsedSeconds: number): string | null {
  const reached = stages.filter((stage) => elapsedSeconds >= stage.atSeconds).length
  return stages[Math.max(reached - 1, 0)]?.label ?? null
}

export function useStagedStatus(stages: ReadonlyArray<StagedStatusStage>, active: boolean): string | null {
  const [, setTick] = useState(0)
  const activeRef = useRef(active)
  const startedAtRef = useRef<number | null>(null)
  activeRef.current = active
  if (active && startedAtRef.current === null) startedAtRef.current = Date.now()

  useMountEffect(() => {
    const timer = setInterval(() => {
      // The start time resets here rather than during render, so a transient
      // active=false flicker between ticks doesn't restart the stage progression.
      if (!activeRef.current) startedAtRef.current = null
      else setTick((tick) => tick + 1)
    }, 1000)
    return () => clearInterval(timer)
  })

  if (!active || startedAtRef.current === null) return null
  return selectStage(stages, (Date.now() - startedAtRef.current) / 1000)
}
