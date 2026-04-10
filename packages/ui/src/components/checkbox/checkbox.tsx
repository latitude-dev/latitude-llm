import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import type React from "react"
import { cn } from "../../utils/cn.ts"

export type CheckedState = CheckboxPrimitive.CheckedState

interface CheckboxProps {
  checked?: CheckedState | undefined
  defaultChecked?: CheckedState | undefined
  onCheckedChange?: ((checked: CheckedState) => void) | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  name?: string | undefined
  value?: string | undefined
  id?: string | undefined
  tabIndex?: number | undefined
  className?: string | undefined
  onClick?: ((e: React.MouseEvent) => void) | undefined
  ref?: React.Ref<React.ComponentRef<typeof CheckboxPrimitive.Root>> | undefined
  "aria-label"?: string
  "aria-labelledby"?: string
  /** Visualize the hit area with a dashed border + tinted background (uses hit-area-debug) */
  debugHitArea?: boolean | undefined
}

function definedProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) result[k] = v
  }
  return result
}

function Checkbox({ className, checked, debugHitArea, ref, ...rest }: CheckboxProps) {
  const rootProps = definedProps(rest)
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      {...(checked !== undefined ? { checked } : {})}
      {...rootProps}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-input ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
        "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary",
        "cursor-pointer transition-colors hit-area-3",
        className,
        {
          "hit-area-debug": debugHitArea,
        },
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {checked === "indeterminate" ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
