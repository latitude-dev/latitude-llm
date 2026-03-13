import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { type ElementRef, forwardRef } from "react"
import { cn } from "../../utils/cn.ts"

export type CheckedState = CheckboxPrimitive.CheckedState

interface CheckboxProps {
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?: (checked: CheckedState) => void
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  className?: string
  onClick?: (e: React.MouseEvent) => void
  /** Visualize the hit area with a dashed border + tinted background (uses hit-area-debug) */
  debugHitArea?: boolean
}

function definedProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) result[k] = v
  }
  return result
}

const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, checked, debugHitArea, ...rest }, ref) => {
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
          "cursor-pointer transition-colors",
          debugHitArea && "hit-area-debug",
          className,
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          {checked === "indeterminate" ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    )
  },
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
