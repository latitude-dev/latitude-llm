import { useRef } from "react"

import { ShaderSurface, type ShaderTargets } from "./shader-surface.tsx"
import { FRAGMENT_SHADER } from "./shaders.ts"

// Ambient state: no focus/loading, just a steady, slightly-livelier-than-idle border.
const AMBIENT_INTENSITY = 0.85
const AMBIENT_TIME_SCALE = 0.55

/**
 * The ambient animated brand-gradient border from `AgentTextarea`, as a standalone overlay.
 * Render it as the first child of a `relative` container whose visible border is transparent;
 * it paints a glowing animated hairline around that container's rounded rectangle (and a soft
 * outer bleed). Non-interactive; falls back to a static primary glow under reduced motion or
 * without WebGL. Pass `radiusPx` to match the container's corner radius (Tailwind `rounded-md`=6,
 * `rounded-lg`=8 with the default `--radius`); a tuple sets each corner in CSS order.
 */
export function AnimatedBorder({
  radiusPx,
  intensity = AMBIENT_INTENSITY,
}: {
  readonly radiusPx?: number | readonly [number, number, number, number]
  /** Overall border strength (hairline + glow), read once on mount. Defaults to the ambient level. */
  readonly intensity?: number
}) {
  const targetsRef = useRef<ShaderTargets>({
    coverage: 0,
    intensity,
    focus: 0,
    timeScale: AMBIENT_TIME_SCALE,
  })
  return (
    <ShaderSurface
      fragmentSource={FRAGMENT_SHADER}
      targetsRef={targetsRef}
      loading={false}
      {...(radiusPx !== undefined ? { radiusPx } : {})}
    />
  )
}
