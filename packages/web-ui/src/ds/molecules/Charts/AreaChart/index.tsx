'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Area, AreaChart as RechartsAreaChart, XAxis, YAxis } from 'recharts'
import {
  NameType,
  Payload,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Text,
} from '../../../atoms'
import { AreaChartConfig, CartesianDataItem } from '../types'

export function AreaChart({ config }: { config: AreaChartConfig }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{
    width: number
    height: number
  }>({ width: 0, height: 0 })

  const color = useMemo(
    () => config.color ?? 'rgb(var(--primary))',
    [config.color],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = containerRef.current!.getBoundingClientRect()
      setDimensions({ width, height })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const labelFormatter = useCallback(
    (_: string, payload: Payload<ValueType, NameType>[]) => {
      const dataPayload = payload[0]!.payload as CartesianDataItem
      if (config.tooltipLabel) {
        return config.tooltipLabel(dataPayload)
      }

      return <Text.H5B>{dataPayload.label}</Text.H5B>
    },
    [config.tooltipLabel],
  )

  const tooltipFormatter = useCallback(
    (
      _value: ValueType,
      name: NameType,
      payload: Payload<ValueType, NameType>,
    ) => {
      if (name !== 'y') return null // Used to display a single content

      const item = payload.payload as CartesianDataItem
      if (config.tooltipContent) return config.tooltipContent(item)

      return (
        <div className='flex w-full flex-col gap-2'>
          <div className='flex w-full gap-2 justify-between'>
            <Text.H6B>{config.xAxis.label}</Text.H6B>
            <Text.H6>{item.x}</Text.H6>
          </div>
          <div className='flex w-full gap-2 justify-between'>
            <Text.H6B>{config.yAxis.label}</Text.H6B>
            <Text.H6>{item.y}</Text.H6>
          </div>
        </div>
      )
    },
    [config.xAxis.label, config.yAxis.label],
  )

  return (
    <ChartContainer
      config={{
        x: {
          label: config.xAxis.label,
        },
        y: {
          label: config.yAxis.label,
        },
      }}
      ref={containerRef}
    >
      <RechartsAreaChart width={dimensions.width} height={dimensions.height}>
        <XAxis
          dataKey='x'
          tickLine={config.xAxis.tickLine ?? false}
          axisLine={config.xAxis.axisLine ?? false}
          type={config.xAxis.type}
          unit={config.xAxis.unit}
          tickFormatter={config.xAxis.tickFormatter}
          domain={
            config.xAxis.type === 'number'
              ? [config.xAxis.min ?? 'dataMin', config.xAxis.max ?? 'dataMax']
              : undefined
          }
        />
        <YAxis
          dataKey='y'
          tickLine={config.yAxis.tickLine ?? false}
          axisLine={config.yAxis.axisLine ?? false}
          tickFormatter={config.yAxis.tickFormatter}
          type={config.yAxis.type}
          unit={config.yAxis.unit}
          domain={
            config.yAxis.type === 'number'
              ? [config.yAxis.min ?? 'dataMin', config.yAxis.max ?? 'dataMax']
              : undefined
          }
        />
        <defs>
          <linearGradient id='chartGradient' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='5%' stopColor={color} stopOpacity={0.8} />
            <stop offset='95%' stopColor={color} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          dataKey='y'
          type='natural'
          stroke={color}
          fill='url(#chartGradient)'
          data={config.data.map((item) => ({
            x: item.x,
            y: item.y,
          }))}
          dot={{
            fill: color,
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey='y'
              nameKey='y'
              labelFormatter={labelFormatter}
              formatter={tooltipFormatter}
            />
          }
        />
      </RechartsAreaChart>
    </ChartContainer>
  )
}
