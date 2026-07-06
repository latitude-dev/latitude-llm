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
  if (!active) startedAtRef.current = null

  useMountEffect(() => {
    const timer = setInterval(() => {
      if (activeRef.current) setTick((tick) => tick + 1)
    }, 1000)
    return () => clearInterval(timer)
  })

  if (!active || startedAtRef.current === null) return null
  return selectStage(stages, (Date.now() - startedAtRef.current) / 1000)
}
