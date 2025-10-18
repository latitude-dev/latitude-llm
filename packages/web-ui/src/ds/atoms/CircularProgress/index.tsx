'use client'

import { useEffect, useState } from 'react'

import { cn } from '../../../lib/utils'
import { colors, TextColor } from '../../tokens'

export type CircularProgressProps = {
  value: number
  color?: TextColor
  showBackground?: boolean
  size?: number
  strokeWidth?: number
  className?: string
  animateOnMount?: boolean
}

export function CircularProgress({
  value: valueProp,
  color = 'primary',
  showBackground,
  size = 14,
  strokeWidth = 3,
  className,
  animateOnMount = true,
}: CircularProgressProps) {
  const [value, setValue] = useState(animateOnMount ? 0 : valueProp)

  // FIXME: Do not use useEffect to set state, instead add a dealy to the value
  // prop wherever it is set
  useEffect(() => {
    if (animateOnMount) setValue(valueProp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateOnMount])

  // FIXME: Do not use useEffect to set state, instead add a dealy to the value
  // prop wherever it is set
  useEffect(() => {
    setValue(valueProp)
  }, [valueProp])

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = value * circumference

  return (
    <svg
      width={size}
      height={size}
      className={cn('-rotate-90', colors.textColors[color], className)}
    >
      {showBackground && (
        <circle
          className='opacity-20'
          stroke='currentColor'
          fill='transparent'
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap='round'
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      )}
      <circle
        className='transition-all duration-300 ease-in-out'
        stroke='currentColor'
        fill='transparent'
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={progress - circumference}
        strokeLinecap='round'
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
    </svg>
  )
}

export default CircularProgress
