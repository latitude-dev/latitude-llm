'use client'

import { CSSProperties, ReactNode, useEffect, useRef } from 'react'

import { cn } from '../../../lib/utils'
import { Gradient } from './Gradient.js'

export function ClientMeshGradient({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const gradientRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!gradientRef.current) return

    const randomId = '_' + Math.random().toString(36).substring(2, 11)
    gradientRef.current.setAttribute('id', randomId)

    const gradient = new Gradient()
    //@ts-expect-error
    gradient.initGradient(`#${randomId}`)

    return () => {
      gradient.disconnect()
    }
  }, [])

  return (
    <div className={cn(className, 'relative overflow-hidden')}>
      <div className='absolute top-0 left-0 w-full h-full'>
        <canvas
          data-transition-in
          ref={gradientRef}
          style={
            {
              width: '100%',
              height: '100%',
              '--gradient-color-1': '#c3e4ff',
              '--gradient-color-2': '#6ec3f4',
              '--gradient-color-3': '#eae2ff',
              '--gradient-color-4': '#b9beff',
            } as CSSProperties
          }
        />
      </div>
      {children}
    </div>
  )
}
