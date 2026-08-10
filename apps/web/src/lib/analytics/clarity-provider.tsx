import { useMountEffect } from "@repo/ui"
import { loadClarity } from "./clarity.ts"

interface ClarityRecorderProps {
  readonly excludeFromAnalytics: boolean
}

export function ClarityRecorder({ excludeFromAnalytics }: ClarityRecorderProps) {
  useMountEffect(() => {
    if (excludeFromAnalytics) return
    loadClarity()
  })

  return null
}
