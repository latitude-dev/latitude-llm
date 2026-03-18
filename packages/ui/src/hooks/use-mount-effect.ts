import type { EffectCallback } from "react"
import { useEffect } from "react"

export function useMountEffect(effect: EffectCallback) {
  useEffect(effect, [])
}
