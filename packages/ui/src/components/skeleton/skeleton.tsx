import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn.js"

function Skeleton({ className, animate = true, ...props }: HTMLAttributes<HTMLDivElement> & { animate?: boolean }) {
  return <div className={cn("rounded-md bg-muted", { "animate-pulse": animate }, className)} {...props} />
}

export { Skeleton }
