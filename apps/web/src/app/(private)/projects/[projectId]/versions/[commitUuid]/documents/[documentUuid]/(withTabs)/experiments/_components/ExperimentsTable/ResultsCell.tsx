import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'

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
          <Badge
            variant='successMuted'
            className={isLoading ? 'animate-pulse' : ''}
          >
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
          <Badge
            variant='destructiveMuted'
            className={isLoading ? 'animate-pulse' : ''}
          >
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
          <Badge variant='muted' className={isLoading ? 'animate-pulse' : ''}>
            {experiment.results.errors}
          </Badge>
        }
      >
        Either the evaluation did not run due to an error running the prompt, or
        the evaluation itself returned an error.
      </Tooltip>
    </div>
  )
}
