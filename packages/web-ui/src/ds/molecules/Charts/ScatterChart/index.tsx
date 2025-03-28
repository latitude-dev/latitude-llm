'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Label,
  ScatterChart as RechartsScatterChart,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
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
import { ScatterChartConfig, ScatterDataItem } from '../types'

export function ScatterChart({ config }: { config: ScatterChartConfig }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{
    width: number
    height: number
  }>({ width: 0, height: 0 })

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

  type DataGroup = {
    data: ScatterDataItem[]
    color: string
    size: number
  }
  const dataGroups = useMemo(() => {
    return config.data.reduce((acc, item) => {
      const itemColor = item.color ?? 'var(--muted)'
      const itemSize = item.size ?? 1

      const existingGroup = acc.find(
        (group) => group.color === itemColor && group.size === itemSize,
      )
      if (existingGroup) {
        existingGroup.data.push(item)
      } else {
        acc.push({ data: [item], color: itemColor, size: itemSize })
      }
      return acc
    }, [] as DataGroup[])
  }, [config.data])

  const labelFormatter = useCallback(
    (_: string, payload: Payload<ValueType, NameType>[]) => {
      const dataPayload = payload[0]!.payload as ScatterDataItem
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

      const item = payload.payload as ScatterDataItem
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
      <RechartsScatterChart width={dimensions.width} height={dimensions.height}>
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
        >
          {!!config.xAxis.legend && (
            <Label
              angle={0}
              value={config.xAxis.legend}
              position='top'
              style={{ textAnchor: 'middle' }}
            />
          )}
        </XAxis>
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
        >
          {!!config.yAxis.legend && (
            <Label
              angle={-90}
              value={config.yAxis.legend}
              position='insideLeft'
              style={{ textAnchor: 'middle' }}
            />
          )}
        </YAxis>
        <ZAxis type='number' dataKey='size' range={[0, 100]} domain={[1, 10]} />
        {config.yAxis.thresholds?.lower !== undefined && (
          <ReferenceLine
            y={config.yAxis.thresholds.lower}
            stroke='hsl(var(--muted-foreground))'
            strokeDasharray='3 3'
            strokeWidth={1}
            label={{
              value: 'lower threshold',
              position: 'insideBottomRight',
            }}
          />
        )}
        {config.yAxis.thresholds?.upper !== undefined && (
          <ReferenceLine
            y={config.yAxis.thresholds.upper}
            stroke='hsl(var(--muted-foreground))'
            strokeDasharray='3 3'
            strokeWidth={1}
            label={{
              value: 'upper threshold',
              position: 'insideBottomRight',
            }}
          />
        )}
        {dataGroups.map((group, idx) => (
          <Scatter
            key={idx}
            dataKey='y'
            fill={group.color}
            data={group.data}
            scale={group.size}
            fontSize={group.size}
          />
        ))}
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
      </RechartsScatterChart>
    </ChartContainer>
  )
}
