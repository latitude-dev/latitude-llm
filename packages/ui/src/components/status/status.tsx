import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef, ReactNode } from "react"

import { cn } from "../../utils/cn.ts"

const statusVariants = cva(
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0 text-xs font-medium leading-4",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
        success: "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
        warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
        destructive: "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
)

const statusDotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    variant: {
      neutral: "bg-muted-foreground",
      info: "bg-blue-600 dark:bg-blue-400",
      success: "bg-green-600 dark:bg-green-400",
      warning: "bg-amber-600 dark:bg-amber-400",
      destructive: "bg-rose-600 dark:bg-rose-400",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
})

export type StatusProps = Omit<ComponentPropsWithRef<"div">, "children"> &
  VariantProps<typeof statusVariants> & {
    readonly label: string
    readonly indicator?: ReactNode | false
  }

function Status({ ref, className, variant, label, indicator, ...props }: StatusProps) {
  return (
    <div ref={ref} className={cn(statusVariants({ variant }), className)} {...props}>
      {indicator === false ? null : (indicator ?? <span className={cn(statusDotVariants({ variant }))} aria-hidden />)}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

export { Status, statusVariants }
