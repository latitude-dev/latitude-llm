import { type ReactNode, useRef, useState } from "react"

import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"
import { ShaderSurface, type ShaderTargets } from "./shader-surface.tsx"
import { FRAGMENT_SHADER } from "./shaders.ts"

const IDLE_INTENSITY = 0.65
const LOADING_INTENSITY = 1
const IDLE_TIME_SCALE = 0.48
const LOADING_TIME_SCALE = 2

export interface AgentShaderPanelProps {
  /** When true, the shader floods with the agent "working" fill and the status crossfades over it. */
  loading: boolean
  status?: string | null
  className?: string
  /** Rendered on top of the shader; faded out while loading so the fill reads cleanly. */
  children?: ReactNode
}

/**
 * A panel backed by the same WebGL shader as {@link AgentTextarea}, but wrapping arbitrary content
 * instead of a textarea. Idle shows the pulsing rainbow border; loading floods the fill and shows a
 * crossfading status line. Used for the command-palette agent's response body.
 */
export function AgentShaderPanel({ loading, status = null, className, children }: AgentShaderPanelProps) {
  const [statusPair, setStatusPair] = useState<{ current: string | null; previous: string | null }>({
    current: status,
    previous: null,
  })
  if (status !== statusPair.current) {
    setStatusPair({ current: status, previous: statusPair.current })
  }

  const targetsRef = useRef<ShaderTargets>({
    coverage: 0,
    intensity: IDLE_INTENSITY,
    focus: 0,
    timeScale: IDLE_TIME_SCALE,
  })
  const targets = targetsRef.current
  targets.coverage = loading ? 1 : 0
  targets.focus = 0
  targets.intensity = loading ? LOADING_INTENSITY : IDLE_INTENSITY
  targets.timeScale = loading ? LOADING_TIME_SCALE : IDLE_TIME_SCALE

  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-0 rounded-md bg-background" />
      <ShaderSurface fragmentSource={FRAGMENT_SHADER} targetsRef={targetsRef} loading={loading} />
      <div className={cn("relative z-10 h-full transition-opacity duration-500", { "opacity-0": loading })}>
        {children}
      </div>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="relative flex w-full items-center justify-center">
            {statusPair.previous !== null ? (
              <div
                key={statusPair.previous}
                className="absolute animate-out fade-out slide-out-to-top-1 fill-mode-forwards duration-500"
              >
                <Text.H5 weight="medium" align="center">
                  {statusPair.previous}
                </Text.H5>
              </div>
            ) : null}
            <div key={statusPair.current} className="animate-in fade-in slide-in-from-bottom-1 duration-500">
              <Text.H5 weight="medium" align="center">
                {statusPair.current}
              </Text.H5>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
