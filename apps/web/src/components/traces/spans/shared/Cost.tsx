import { CostBreakdown } from '@latitude-data/constants/costs'
import { MetadataItemTooltip } from '$/components/MetadataItem'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  CostBreakdownDisplay,
  CostBreakdownSkeleton,
} from '$/components/CostBreakdownDisplay'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'

export function TraceCostDetail({
  costBreakdown,
  isLoading,
  totalCost,
}: {
  costBreakdown: CostBreakdown | null
  isLoading: boolean
  totalCost: number
}) {
  return (
    <MetadataItemTooltip
      label='Cost'
      trigger={
        <Text.H5 align='right' color='foregroundMuted'>
          {formatCostInMillicents(totalCost)}
        </Text.H5>
      }
      tooltipContent={
        isLoading ? (
          <CostBreakdownSkeleton />
        ) : costBreakdown ? (
          <CostBreakdownDisplay breakdown={costBreakdown} color='background' />
        ) : null
      }
    />
  )
}
