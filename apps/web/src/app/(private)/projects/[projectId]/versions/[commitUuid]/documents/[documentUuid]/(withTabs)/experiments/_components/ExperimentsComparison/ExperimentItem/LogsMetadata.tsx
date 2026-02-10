import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { BestRunMetadata } from '$/stores/experimentComparison'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'

function ExperimentRunMetadataItem({
  label,
  value,
  isBest = false,
}: {
  label: string
  value: string
  isBest?: boolean
  onlyOneBest?: boolean
}) {
  const bgClass = isBest ? 'bg-accent' : undefined
  const fgColor = isBest ? 'accentForeground' : 'foregroundMuted'

  return (
    <div
      className={cn(
        'flex flex-col w-full gap-2 items-center px-2 py-4 rounded-md',
        bgClass,
      )}
    >
      <Text.H6 color={fgColor}>{label}</Text.H6>
      <Text.H5B color={fgColor}>{value}</Text.H5B>
    </div>
  )
}

export function ExperimentRunMetadata({
  experiment,
  bestRunMetadata,
}: {
  experiment: ExperimentWithScores
  bestRunMetadata: BestRunMetadata
}) {
  return (
    <div className='flex flex-row items-center gap-4'>
      <ExperimentRunMetadataItem
        label='Duration'
        value={
          experiment.runMetadata.count > 0
            ? formatDuration(
                experiment.runMetadata.totalDuration /
                  experiment.runMetadata.count,
              )
            : '—'
        }
        isBest={bestRunMetadata.duration.includes(experiment.uuid)}
        onlyOneBest={bestRunMetadata.duration.length === 1}
      />
      <ExperimentRunMetadataItem
        label='Tokens'
        value={
          experiment.runMetadata.count > 0
            ? Math.floor(
                experiment.runMetadata.totalTokens /
                  experiment.runMetadata.count,
              ).toString()
            : '—'
        }
        isBest={bestRunMetadata.tokens.includes(experiment.uuid)}
        onlyOneBest={bestRunMetadata.tokens.length === 1}
      />
      <ExperimentRunMetadataItem
        label='Cost'
        value={
          experiment.runMetadata.count > 0
            ? formatCostInMillicents(
                experiment.runMetadata.totalCost / experiment.runMetadata.count,
              )
            : '—'
        }
        isBest={bestRunMetadata.cost.includes(experiment.uuid)}
        onlyOneBest={bestRunMetadata.cost.length === 1}
      />
    </div>
  )
}

export function ExperimentRunMetadataPlaceholder() {
  return (
    <div className='flex flex-row items-center gap-4'>
      <div className='flex flex-col w-full gap-2 items-center p-4 rounded-md bg-muted animate-pulse'>
        <Skeleton height='h5' className='w-[20%]' />
        <Skeleton height='h6' className='w-[60%]' />
      </div>
      <div className='flex flex-col w-full gap-2 items-center p-4 rounded-md bg-muted animate-pulse'>
        <Skeleton height='h5' className='w-[20%]' />
        <Skeleton height='h6' className='w-[60%]' />
      </div>
    </div>
  )
}
