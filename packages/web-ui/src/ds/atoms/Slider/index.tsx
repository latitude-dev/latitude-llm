'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import * as React from 'react'
import { cn } from '../../../lib/utils'
import { Text } from '../Text'

type SliderLegendField = React.ReactNode | string

type SliderLegend = {
  min?: SliderLegendField
  value?: SliderLegendField
  max?: SliderLegendField
}

type SliderLegendFormatter = (value: number) => string

type AdditionalSliderProps = {
  showMiddleRange?: boolean
  legend?: SliderLegend | SliderLegendFormatter | true
}

function LegendLabel({ children }: { children: SliderLegendField }) {
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text.H6 color='foregroundMuted'>{children}</Text.H6>
  }
  return <>{children}</>
}

function LegendValue({ children }: { children: SliderLegendField }) {
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text.H5M color='primary'>{children}</Text.H5M>
  }
  return <>{children}</>
}

function resolveLegend(
  legend: SliderLegend | SliderLegendFormatter | true,
  props: { min?: number; max?: number; value?: number[] },
): SliderLegend {
  if (typeof legend === 'object') return legend

  const fmt = typeof legend === 'function' ? legend : String
  return {
    min: props.min !== undefined ? fmt(props.min) : undefined,
    value: props.value?.[0] !== undefined ? fmt(props.value[0]) : undefined,
    max: props.max !== undefined ? fmt(props.max) : undefined,
  }
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> &
    AdditionalSliderProps
>(({ className, showMiddleRange, legend: legendProp, ...props }, ref) => {
  const legend = legendProp ? resolveLegend(legendProp, props) : null

  return (
    <div className='flex flex-col gap-2 w-full'>
      {legend && (
        <div className='relative flex items-center justify-between min-h-5'>
          <span className='shrink-0'>
            <LegendLabel>{legend.min}</LegendLabel>
          </span>
          {legend.value !== undefined && (
            <span className='absolute left-1/2 -translate-x-1/2'>
              <LegendValue>{legend.value}</LegendValue>
            </span>
          )}
          <span className='shrink-0'>
            <LegendLabel>{legend.max}</LegendLabel>
          </span>
        </div>
      )}
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          className,
        )}
        {...props}
      >
        {showMiddleRange && (
          <div className='absolute h-4 w-0.5 bg-muted-foreground left-1/2 transform -translate-x-1/2 opacity-50 rounded-full' />
        )}
        <SliderPrimitive.Track className='relative h-2 w-full grow overflow-hidden rounded-full bg-muted'>
          <SliderPrimitive.Range className='absolute h-full bg-primary' />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className='cursor-pointer block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50' />
      </SliderPrimitive.Root>
    </div>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
export type { SliderLegend }
