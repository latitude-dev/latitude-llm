import React, { forwardRef, useMemo } from 'react'
import { colors, TextColor } from '../../tokens'
import { cn } from '../../../lib/utils'

const DIAMETER = 100

export const StarburstBadge = forwardRef<
  HTMLDivElement,
  {
    backgroundColor?: TextColor
    borderColor?: TextColor
    spin?: boolean
    spinDurationMs?: number
    className?: string
    children?: React.ReactNode

    spikes?: number // number of points
    borderWidth?: number // px
    borderRadius?: number // px
    ratio?: number // ratio of inner to outer points
  }
>(
  (
    {
      backgroundColor = 'accent',
      borderColor = 'accentForeground',
      spin = false,
      spinDurationMs = 60_000,
      className,
      children,
      spikes = 24,
      borderWidth = 1,
      borderRadius = 4,
      ratio = 0.872,
    },
    ref,
  ) => {
    const { backPoints, frontPoints } = useMemo(() => {
      const backRadius = DIAMETER / 2 - borderRadius
      const backOuter = backRadius
      const backInner = backRadius * ratio

      const frontRadius = DIAMETER / 2 - borderRadius - borderWidth
      const frontOuter = frontRadius
      const frontInner = frontRadius * ratio

      const backPts: string[] = []
      const frontPts: string[] = []

      for (let i = 0; i < spikes * 2; i++) {
        const theta = (i * Math.PI) / spikes
        const isOuter = i % 2 === 0

        {
          const r = isOuter ? backOuter : backInner
          const x = backRadius + r * Math.cos(theta) + borderRadius
          const y = backRadius + r * Math.sin(theta) + borderRadius
          backPts.push(`${x.toFixed(3)},${y.toFixed(3)}`)
        }

        {
          const r = isOuter ? frontOuter : frontInner
          const x =
            frontRadius + r * Math.cos(theta) + borderRadius + borderWidth
          const y =
            frontRadius + r * Math.sin(theta) + borderRadius + borderWidth
          frontPts.push(`${x.toFixed(3)},${y.toFixed(3)}`)
        }
      }

      return {
        backPoints: backPts.join(' '),
        frontPoints: frontPts.join(' '),
      }
    }, [spikes, ratio, borderRadius, borderWidth])

    return (
      <div
        ref={ref}
        className={cn('relative inline-grid place-items-center', className)}
      >
        <div
          className={cn('absolute inset-0 grid place-items-center', {
            'animate-spin': spin,
          })}
          style={{
            animationDuration: `${spinDurationMs}ms`,
          }}
        >
          <svg
            width='100%'
            height='100%'
            viewBox={`0 0 ${DIAMETER} ${DIAMETER}`}
            className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
              colors.textColors[borderColor],
            )}
            style={{ animationDuration: `${spinDurationMs}ms` }}
            role='img'
          >
            <polygon
              points={backPoints}
              fill='currentColor'
              stroke='currentColor'
              strokeWidth={borderRadius}
              strokeLinejoin='round'
            />
          </svg>
          <svg
            width='100%'
            height='100%'
            viewBox={`0 0 ${DIAMETER} ${DIAMETER}`}
            className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
              colors.textColors[backgroundColor],
            )}
            role='img'
          >
            <polygon
              points={frontPoints}
              fill='currentColor'
              stroke='currentColor'
              strokeWidth={borderRadius - borderWidth}
              strokeLinejoin='round'
            />
          </svg>
        </div>

        <div className='relative z-10 max-w-[75%] max-h-[75%] grid place-items-center place-content-center'>
          {children}
        </div>
      </div>
    )
  },
)
