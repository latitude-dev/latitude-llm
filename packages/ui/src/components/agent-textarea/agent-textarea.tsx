import { useRef, useState } from "react"
import TextareaAutosize from "react-textarea-autosize"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { FormField } from "../form-field/form-field.tsx"
import { Text } from "../text/text.tsx"
import type { TextareaProps } from "../textarea/textarea.tsx"
import { ShaderSurface, type ShaderTargets } from "./shader-surface.tsx"
import { type AgentTextareaSettings, DEFAULT_AGENT_TEXTAREA_SETTINGS, FRAGMENT_SHADER } from "./shaders.ts"

export interface AgentTextareaProps extends Omit<TextareaProps, "unstyled"> {
  status?: string | null
  settings?: Partial<AgentTextareaSettings>
}

export function AgentTextarea({
  ref,
  status = null,
  settings,
  label,
  description,
  info,
  errors,
  inline,
  className,
  minRows = 2,
  maxRows,
  disabled,
  onFocus,
  onBlur,
  ...props
}: AgentTextareaProps) {
  const [focused, setFocused] = useState(false)
  const loading = status !== null
  const showDestructiveBorder = errors !== undefined && errors.length > 0 && !loading

  const [statusPair, setStatusPair] = useState<{ current: string | null; previous: string | null }>({
    current: status,
    previous: null,
  })
  if (status !== statusPair.current) {
    setStatusPair({ current: status, previous: statusPair.current })
  }

  const resolvedSettings: AgentTextareaSettings = { ...DEFAULT_AGENT_TEXTAREA_SETTINGS, ...settings }
  const targetsRef = useRef<ShaderTargets>({
    coverage: 0,
    intensity: resolvedSettings.idleIntensity,
    focus: 0,
    timeScale: resolvedSettings.idleTimeScale,
    settings: resolvedSettings,
  })
  const targets = targetsRef.current
  targets.settings = resolvedSettings
  targets.coverage = loading ? 1 : 0
  targets.focus = focused && !loading ? 1 : 0
  targets.intensity = loading
    ? resolvedSettings.loadingIntensity
    : showDestructiveBorder
      ? 0
      : focused
        ? resolvedSettings.focusIntensity
        : resolvedSettings.idleIntensity
  targets.timeScale = loading
    ? resolvedSettings.loadingTimeScale
    : focused
      ? resolvedSettings.focusTimeScale
      : resolvedSettings.idleTimeScale

  return (
    <FormField label={label} description={description} info={info} errors={errors} inline={inline}>
      <div className="relative">
        <ShaderSurface fragmentSource={FRAGMENT_SHADER} targetsRef={targetsRef} loading={loading} />
        <TextareaAutosize
          ref={ref}
          minRows={minRows}
          {...(maxRows !== undefined ? { maxRows } : {})}
          disabled={disabled || loading}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          className={cn(
            font.size.h5,
            "relative z-10 block w-full resize-none outline-none",
            "rounded-md border bg-background px-3 py-2 placeholder:text-muted-foreground",
            "transition-opacity duration-500 focus-visible:ring-1 focus-visible:ring-ring",
            {
              "border-destructive": showDestructiveBorder,
              "border-input": !showDestructiveBorder && resolvedSettings.nativeBorder,
              "border-transparent": !showDestructiveBorder && !resolvedSettings.nativeBorder,
              "opacity-0": loading,
              "disabled:cursor-not-allowed disabled:opacity-50": !loading,
            },
            className,
          )}
          {...props}
        />
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
    </FormField>
  )
}
