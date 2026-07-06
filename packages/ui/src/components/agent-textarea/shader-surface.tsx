import { type RefObject, useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { type AgentTextareaSettings, VERTEX_SHADER } from "./shaders.ts"

export interface ShaderTargets {
  coverage: number
  intensity: number
  focus: number
  timeScale: number
  settings: AgentTextareaSettings
}

const SETTINGS_UNIFORMS = {
  thicknessIdle: "u_thicknessIdle",
  thicknessFocus: "u_thicknessFocus",
  spotSizeIdle: "u_spotSizeIdle",
  spotSizeFocus: "u_spotSizeFocus",
  spotCount: "u_spotCount",
  spotIntensity: "u_spotIntensity",
  pulse: "u_pulse",
  smokeIdle: "u_smokeIdle",
  smokeFocus: "u_smokeFocus",
  smokeScaleIdle: "u_smokeScaleIdle",
  smokeScaleFocus: "u_smokeScaleFocus",
  bloom: "u_bloom",
  baseAlpha: "u_baseAlpha",
  dotCell: "u_dotCell",
  dotSizeMax: "u_dotSizeMax",
  dotSpeed: "u_dotSpeed",
  auroraScale: "u_auroraScale",
  auroraSpeed: "u_auroraSpeed",
} as const

const SETTINGS_UNIFORM_KEYS = Object.keys(SETTINGS_UNIFORMS) as ReadonlyArray<keyof typeof SETTINGS_UNIFORMS>

interface ShaderSurfaceProps {
  fragmentSource: string
  targetsRef: RefObject<ShaderTargets>
  loading: boolean
}

const BLEED_PX = 8
const RADIUS_PX = 6
const MAX_DPR = 2
const COVERAGE_RATE = 8
const INTENSITY_RATE = 4
const FOCUS_RATE = 5
const TIME_SCALE_RATE = 3
const LIGHT_RATE = 6
const MAX_FRAME_DT = 0.05
const CONTEXT_RESTORE_GRACE_MS = 1500

const UNIFORM_NAMES = [
  "u_resolution",
  "u_time",
  "u_coverage",
  "u_intensity",
  "u_focus",
  "u_light",
  "u_radius",
  "u_bleed",
  ...Object.values(SETTINGS_UNIFORMS),
] as const

type Uniforms = Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (shader === null) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    if (info !== null && info.length > 0) console.warn(`AgentTextarea shader compile error: ${info}`)
    return null
  }
  return shader
}

function setupProgram(gl: WebGLRenderingContext, fragmentSource: string): Uniforms | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (vertex === null || fragment === null) return null
  const program = gl.createProgram()
  if (program === null) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null

  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const positionLocation = gl.getAttribLocation(program, "a_position")
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {} as Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>
  for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name)
  return uniforms
}

function smoothToward(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * dt))
}

export function ShaderSurface({ fragmentSource, targetsRef, loading }: ShaderSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fallback, setFallback] = useState(false)

  // fragmentSource is read once here; remount (key) to switch shaders.
  useMountEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const disable = (reason: string) => {
      console.warn(`AgentTextarea shader disabled: ${reason}`)
      setFallback(true)
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFallback(true)
      return
    }
    // WebGL1 for Safari compat.
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false })
    if (gl === null) {
      disable("WebGL unavailable")
      return
    }
    let uniforms: Uniforms | null = null

    const readLightTarget = () => (document.documentElement.classList.contains("dark") ? 0 : 1)
    let lightTarget = readLightTarget()
    let light = lightTarget
    const themeObserver = new MutationObserver(() => {
      lightTarget = readLightTarget()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    let dpr = Math.min(window.devicePixelRatio, MAX_DPR)
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio, MAX_DPR)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const current: ShaderTargets = { ...targetsRef.current, intensity: 0 }
    let shaderTime = 0
    let lastTimestamp: number | null = null
    let rafId = 0
    let pageVisible = document.visibilityState === "visible"
    let intersecting = true
    let contextLost = false

    const frame = (timestamp: number) => {
      const locations = uniforms
      if (locations === null) return
      const dt = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_DT)
      lastTimestamp = timestamp
      const targets = targetsRef.current
      current.coverage = smoothToward(current.coverage, targets.coverage, COVERAGE_RATE, dt)
      current.intensity = smoothToward(current.intensity, targets.intensity, INTENSITY_RATE, dt)
      current.focus = smoothToward(current.focus, targets.focus, FOCUS_RATE, dt)
      current.timeScale = smoothToward(current.timeScale, targets.timeScale, TIME_SCALE_RATE, dt)
      light = smoothToward(light, lightTarget, LIGHT_RATE, dt)
      shaderTime += dt * current.timeScale

      gl.uniform2f(locations.u_resolution, canvas.width, canvas.height)
      gl.uniform1f(locations.u_time, shaderTime)
      gl.uniform1f(locations.u_coverage, current.coverage)
      gl.uniform1f(locations.u_intensity, current.intensity)
      gl.uniform1f(locations.u_focus, current.focus)
      gl.uniform1f(locations.u_light, light)
      gl.uniform1f(locations.u_radius, RADIUS_PX * dpr)
      gl.uniform1f(locations.u_bleed, BLEED_PX * dpr)
      for (const key of SETTINGS_UNIFORM_KEYS) {
        gl.uniform1f(locations[SETTINGS_UNIFORMS[key]], targets.settings[key])
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      rafId = requestAnimationFrame(frame)
    }

    const syncRunning = () => {
      const shouldRun = pageVisible && intersecting && !contextLost
      if (shouldRun && rafId === 0) {
        lastTimestamp = null
        rafId = requestAnimationFrame(frame)
      } else if (!shouldRun && rafId !== 0) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible"
      syncRunning()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    const intersectionObserver = new IntersectionObserver((entries) => {
      intersecting = entries[entries.length - 1]?.isIntersecting ?? true
      syncRunning()
    })
    intersectionObserver.observe(canvas)

    const initialize = () => {
      uniforms = setupProgram(gl, fragmentSource)
      if (uniforms === null) {
        disable("shader compile failed")
        return
      }
      resize()
      contextLost = false
      syncRunning()
    }

    let restoreTimer: ReturnType<typeof setTimeout> | null = null
    const onContextLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      syncRunning()
      restoreTimer = setTimeout(() => disable("WebGL context lost"), CONTEXT_RESTORE_GRACE_MS)
    }
    const onContextRestored = () => {
      if (restoreTimer !== null) {
        clearTimeout(restoreTimer)
        restoreTimer = null
      }
      initialize()
    }
    canvas.addEventListener("webglcontextlost", onContextLost)
    canvas.addEventListener("webglcontextrestored", onContextRestored)

    // Suspense/Activity reconnects re-run this effect after our own cleanup lost the context —
    // getContext then returns the same lost context, so revive it instead of failing compile.
    if (gl.isContextLost()) {
      contextLost = true
      const loseExtension = gl.getExtension("WEBGL_lose_context")
      if (loseExtension === null) {
        disable("WebGL context lost")
      } else {
        loseExtension.restoreContext()
        restoreTimer = setTimeout(() => disable("WebGL context lost"), CONTEXT_RESTORE_GRACE_MS)
      }
    } else {
      initialize()
    }

    return () => {
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", onContextRestored)
      if (restoreTimer !== null) clearTimeout(restoreTimer)
      if (rafId !== 0) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      themeObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      // No loseContext here: Suspense/Activity re-runs this effect and a context we lost ourselves
      // is unrestorable (its lost event fires after our listeners are gone, so nothing can
      // preventDefault it). Shrink the backing store instead; resize() restores it on re-run.
      canvas.width = 1
      canvas.height = 1
    }
  })

  return (
    <div className="pointer-events-none absolute -inset-2">
      {fallback ? (
        <div
          className={cn("absolute inset-2 rounded-md border border-input transition-colors", {
            "bg-primary-muted": loading,
            "shadow-[0_0_12px_3px_hsl(var(--primary)/0.25)]": !loading,
          })}
        />
      ) : (
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
      )}
    </div>
  )
}
