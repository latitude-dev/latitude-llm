import { HTMLAttributes } from 'react'

import { cn } from '../../../lib/utils'
import { skeleton, SkeletonHeight } from '../../tokens'

function Skeleton({
  className,
  height,
  animate = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  height?: SkeletonHeight
  animate?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-muted-foreground/10',
        height && skeleton.height[height],
        animate && 'animate-pulse',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
