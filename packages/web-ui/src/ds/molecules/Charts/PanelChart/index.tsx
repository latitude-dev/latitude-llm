'use client'

import { Text } from '../../../atoms/Text'
import { PanelChartConfig } from '../types'

export function PanelChart({ data, asChild }: PanelChartConfig) {
  return asChild ? data : <Text.H3B>{data}</Text.H3B>
}
