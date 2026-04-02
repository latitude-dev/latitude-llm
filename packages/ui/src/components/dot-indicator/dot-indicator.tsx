import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"

import { cn } from "../../utils/cn.ts"

const dotIndicatorVariants = cva("inline-block shrink-0 rounded-full", {
  variants: {
    variant: {
      success: "bg-green-500",
      default: "bg-muted-foreground",
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

export type DotIndicatorProps = ComponentPropsWithRef<"span"> & VariantProps<typeof dotIndicatorVariants>

function DotIndicator({
  ref,
  className,
  variant,
  size,
  "aria-hidden": ariaHidden = true,
  ...props
}: DotIndicatorProps) {
  return (
    <span
      ref={ref}
      aria-hidden={ariaHidden}
      className={cn(dotIndicatorVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { DotIndicator, dotIndicatorVariants }
