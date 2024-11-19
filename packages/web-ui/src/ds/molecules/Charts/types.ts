import { ReactNode } from 'react'

export interface CartesianDataItem {
  x: number | string
  y: number | string
  [key: string]: any
}

export interface CartesianAxisConfig {
  label: string
  type: 'number' | 'category'
  unit?: string
  min?: number | 'auto' | 'dataMin'
  max?: number | 'auto' | 'dataMax'
  tickLine?: boolean
  axisLine?: boolean
  tickFormatter?: (value: string | number) => string
}

interface ICartesianChartConfig {
  type: 'area' | 'scatter'
  data: CartesianDataItem[]
  xAxis: CartesianAxisConfig
  yAxis: CartesianAxisConfig
  tooltipLabel?: (item: CartesianDataItem) => ReactNode
  tooltipContent?: (item: CartesianDataItem) => ReactNode
}

export interface ScatterDataItem extends CartesianDataItem {
  color?: string
  size?: number
  label?: string
}

interface IScatterChartConfig extends ICartesianChartConfig {
  type: 'scatter'
  data: ScatterDataItem[]
  tooltipLabel?: (item: ScatterDataItem) => ReactNode
  tooltipContent?: (item: ScatterDataItem) => ReactNode
}

interface IAreaChartConfig extends ICartesianChartConfig {
  type: 'area'
  color?: string
  gradient?: boolean
}

export type ScatterChartConfig = Omit<IScatterChartConfig, 'type'>
export type AreaChartConfig = Omit<IAreaChartConfig, 'type'>

export type BarChartConfig = {
  data: CartesianDataItem[]
  color?: string
  xAxis: CartesianAxisConfig
  yAxis: CartesianAxisConfig
  tooltipLabel?: (item: CartesianDataItem) => ReactNode
  tooltipContent?: (item: CartesianDataItem) => ReactNode
}
