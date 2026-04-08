import { cva, type VariantProps } from "class-variance-authority"
import { type ComponentPropsWithoutRef, forwardRef } from "react"

import { cn } from "../../utils/cn.ts"

const statusVariants = cva(
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0 text-xs font-medium leading-4",
  {
    variants: {
      variant: {
        /** Neutral — e.g. invitation pending */
        pending: "bg-muted text-muted-foreground",
        /** Success — e.g. invitation accepted / active member */
        accepted: "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
        /** Destructive — e.g. invitation expired */
        expired: "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
      },
    },
    defaultVariants: {
      variant: "pending",
    },
  },
)

const dotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    variant: {
      pending: "bg-muted-foreground",
      accepted: "bg-green-600 dark:bg-green-400",
      expired: "bg-rose-600 dark:bg-rose-400",
    },
  },
  defaultVariants: {
    variant: "pending",
  },
})

export type StatusProps = ComponentPropsWithoutRef<"div"> &
  VariantProps<typeof statusVariants> & {
    label: string
  }

const Status = forwardRef<HTMLDivElement, StatusProps>(function Status({ className, variant, label, ...props }, ref) {
  return (
    <div ref={ref} className={cn(statusVariants({ variant }), className)} {...props}>
      <span className={cn(dotVariants({ variant }))} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
})
Status.displayName = "Status"

export { Status, statusVariants }
