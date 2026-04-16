import * as SwitchPrimitive from "@radix-ui/react-switch"
import type { ComponentRef, Ref } from "react"
import { cn } from "../../utils/cn.ts"

export interface SwitchProps {
  ref?: Ref<ComponentRef<typeof SwitchPrimitive.Root>>
  id?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  required?: boolean
  name?: string
  value?: string
  className?: string
}

function Switch({ className, disabled, loading = false, ref, ...props }: SwitchProps) {
  const isDisabled = disabled || loading

  return (
    <SwitchPrimitive.Root
      ref={ref}
      {...props}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-background text-foreground/60 shadow-lg ring-0",
          "transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        )}
      >
        {loading ? (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
        ) : null}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
