import type { ExperimentDto } from '@latitude-data/core/browser'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function ResultsCell({
  experiment,
  isLoading,
}: {
  experiment: ExperimentDto
  isLoading?: boolean
}) {
  if (!experiment.evaluationUuids.length) {
    return <Text.H6 color='foregroundMuted'>No evaluations</Text.H6>
  }

  return (
    <div className='flex items-center gap-1'>
      <Tooltip
        trigger={
          <Badge variant='successMuted' className={isLoading ? 'animate-pulse' : ''}>
            {experiment.results.passed}
          </Badge>
        }
      >
        Passed
      </Tooltip>
      <Text.H5 noWrap color='foregroundMuted'>
        /
      </Text.H5>
      <Tooltip
        trigger={
          <Badge variant='warningMuted' className={isLoading ? 'animate-pulse' : ''}>
            {experiment.results.failed}
          </Badge>
        }
      >
        Failed
      </Tooltip>
      <Text.H5 noWrap color='foregroundMuted'>
        /
      </Text.H5>
      <Tooltip
        trigger={
          <Badge variant='destructiveMuted' className={isLoading ? 'animate-pulse' : ''}>
            {experiment.results.errors}
          </Badge>
        }
      >
        Errors
      </Tooltip>
    </div>
  )
}
