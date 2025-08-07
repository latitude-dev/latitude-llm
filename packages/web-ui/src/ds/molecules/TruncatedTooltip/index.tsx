'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Tooltip } from '../../atoms/Tooltip'
import { cn } from '../../../lib/utils'

export function TruncatedTooltip({
  content,
  children,
  className,
}: {
  content: ReactNode | string
  children: ReactNode
  className?: string
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const checkOverflow = () => {
      if (textRef.current) {
        setIsOverflowing(textRef.current.scrollWidth > textRef.current.clientWidth)
      }
    }

    const observer = new ResizeObserver(checkOverflow)
    observer.observe(textRef.current!)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div className='truncate'>
      <Tooltip
        asChild
        className='max-w-full truncate'
        open={isOverflowing ? undefined : false}
        trigger={
          <div ref={textRef} className={cn('max-w-full truncate', className)}>
            {children}
          </div>
        }
      >
        {content}
      </Tooltip>
    </div>
  )
}
