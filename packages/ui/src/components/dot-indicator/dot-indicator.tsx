import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"

import { cn } from "../../utils/cn.ts"

const dotIndicatorVariants = cva("inline-block shrink-0 rounded-full", {
  variants: {
    variant: {
      success: "bg-green-500",
      default: "bg-muted-foreground",
      primary: "bg-primary",
    },
    size: {
      sm: "size-1.5",
      md: "size-2",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "sm",
  },
})

export type DotIndicatorProps = ComponentPropsWithRef<"span"> &
  VariantProps<typeof dotIndicatorVariants> & {
    ping?: boolean
  }

function DotIndicator({
  ref,
  className,
  variant,
  size,
  ping = false,
  "aria-hidden": ariaHidden = true,
  ...props
}: DotIndicatorProps) {
  const dotClass = dotIndicatorVariants({ variant, size })

  if (ping) {
    return (
      <span ref={ref} aria-hidden={ariaHidden} className={cn(dotClass, "relative inline-flex", className)} {...props}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-inherit opacity-75" />
      </span>
    )
  }

  return <span ref={ref} aria-hidden={ariaHidden} className={cn(dotClass, className)} {...props} />
}

export { DotIndicator }
