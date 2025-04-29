import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { BestLogsMetadata } from '$/stores/experimentComparison'
import { ExperimentWithScores } from '@latitude-data/core/browser'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

function ExperimentLogMetadataItem({
  label,
  value,
  isBest = false,
}: {
  label: string
  value: string
  isBest?: boolean
  onlyOneBest?: boolean
}) {
  const bgClass = isBest ? 'bg-accent' : 'bg-secondary'
  const fgColor = isBest ? 'accentForeground' : 'foregroundMuted'

  return (
    <div
      className={cn(
        'flex flex-col w-full gap-2 items-center p-4 rounded-md',
        bgClass,
      )}
    >
      <Text.H5B color={fgColor}>{value}</Text.H5B>
      <Text.H6 color={fgColor}>{label}</Text.H6>
    </div>
  )
}

export function ExperimentLogsMetadata({
  experiment,
  bestLogsMetadata,
}: {
  experiment: ExperimentWithScores
  bestLogsMetadata: BestLogsMetadata
}) {
  return (
    <div className='flex flex-row items-center gap-4'>
      <ExperimentLogMetadataItem
        label='avg duration'
        value={
          experiment.logsMetadata.count > 0
            ? formatDuration(
                experiment.logsMetadata.totalDuration /
                  experiment.logsMetadata.count,
              )
            : '—'
        }
        isBest={bestLogsMetadata.duration.includes(experiment.uuid)}
        onlyOneBest={bestLogsMetadata.duration.length === 1}
      />
      <ExperimentLogMetadataItem
        label='avg cost'
        value={
          experiment.logsMetadata.count > 0
            ? formatCostInMillicents(
                experiment.logsMetadata.totalCost /
                  experiment.logsMetadata.count,
              )
            : '—'
        }
        isBest={bestLogsMetadata.cost.includes(experiment.uuid)}
        onlyOneBest={bestLogsMetadata.cost.length === 1}
      />
    </div>
  )
}

export function ExperimentLogsMetadataPlaceholder() {
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
