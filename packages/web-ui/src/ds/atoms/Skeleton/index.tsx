import type { HTMLAttributes } from 'react'

import { cn } from '../../../lib/utils'
import { skeleton, type SkeletonHeight } from '../../tokens'

function Skeleton({
  className,
  height,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  height?: SkeletonHeight
}) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-muted-foreground/10',
        height && skeleton.height[height],
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
