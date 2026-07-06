import { type FocusEvent, useRef, useState } from "react"
import TextareaAutosize from "react-textarea-autosize"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { FormField } from "../form-field/form-field.tsx"
import { Text } from "../text/text.tsx"
import type { TextareaProps } from "../textarea/textarea.tsx"
import { ShaderSurface, type ShaderTargets } from "./shader-surface.tsx"
import { FRAGMENT_SHADER } from "./shaders.ts"

const IDLE_INTENSITY = 0.65
const FOCUS_INTENSITY = 0.9
const LOADING_INTENSITY = 1
const IDLE_TIME_SCALE = 0.48
const FOCUS_TIME_SCALE = 1
const LOADING_TIME_SCALE = 2

export interface AgentTextareaProps extends Omit<TextareaProps, "unstyled"> {
  status?: string | null
  /** Stretch to the parent's height instead of autosizing to content; ignores minRows/maxRows. */
  fill?: boolean
}

export function AgentTextarea({
  ref,
  status = null,
  fill = false,
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

  const targetsRef = useRef<ShaderTargets>({
    coverage: 0,
    intensity: IDLE_INTENSITY,
    focus: 0,
    timeScale: IDLE_TIME_SCALE,
  })
  const targets = targetsRef.current
  targets.coverage = loading ? 1 : 0
  targets.focus = focused && !loading ? 1 : 0
  targets.intensity = loading
    ? LOADING_INTENSITY
    : showDestructiveBorder
      ? 0
      : focused
        ? FOCUS_INTENSITY
        : IDLE_INTENSITY
  targets.timeScale = loading ? LOADING_TIME_SCALE : focused ? FOCUS_TIME_SCALE : IDLE_TIME_SCALE

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    setFocused(true)
    onFocus?.(event)
  }
  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    setFocused(false)
    onBlur?.(event)
  }
  const textareaClassName = cn(
    font.size.h5,
    // transform-gpu isolates the text on its own compositor layer, so keystroke
    // repaints don't contend with the animating canvas underneath.
    "relative z-10 block w-full transform-gpu resize-none outline-none",
    "rounded-md border bg-background px-3 py-2 placeholder:text-muted-foreground",
    "transition-opacity duration-500 focus-visible:ring-1 focus-visible:ring-ring",
    {
      "border-destructive": showDestructiveBorder,
      "border-transparent": !showDestructiveBorder,
      "opacity-0": loading,
      "disabled:cursor-not-allowed disabled:opacity-50": !loading,
    },
    className,
  )

  return (
    <FormField
      label={label}
      description={description}
      info={info}
      errors={errors}
      inline={inline}
      className={fill ? "h-full min-h-0" : undefined}
    >
      <div className={cn("relative", { "min-h-0 flex-1": fill })}>
        {/* Sits under the canvas so the fill's backdrop is the textarea's own background
            once the textarea fades out while loading. */}
        <div className="absolute inset-0 rounded-md bg-background" />
        <ShaderSurface fragmentSource={FRAGMENT_SHADER} targetsRef={targetsRef} loading={loading} />
        {fill ? (
          <textarea
            ref={ref}
            disabled={disabled || loading}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(textareaClassName, "h-full")}
            {...props}
          />
        ) : (
          <TextareaAutosize
            ref={ref}
            minRows={minRows}
            {...(maxRows !== undefined ? { maxRows } : {})}
            disabled={disabled || loading}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={textareaClassName}
            {...props}
          />
        )}
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
