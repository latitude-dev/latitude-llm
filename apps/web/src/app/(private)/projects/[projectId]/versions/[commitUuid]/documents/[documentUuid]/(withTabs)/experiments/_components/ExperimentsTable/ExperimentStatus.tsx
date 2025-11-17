import { getStatus } from './shared'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCallback, useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { stopExperimentAction } from '$/actions/experiments'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'

export function ExperimentStatus({
  projectId,
  commitUuid,
  documentUuid,
  experiment,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  experiment: ExperimentDto
}) {
  const { isPending, isRunning } = getStatus(experiment)
  const [isHovered, setIsHovered] = useState(false)

  const { execute } = useLatitudeAction(stopExperimentAction)
  const stopExperiment = useCallback(() => {
    execute({
      experimentUuid: experiment.uuid,
      projectId,
      commitUuid,
      documentUuid,
    })
  }, [experiment.uuid, execute, projectId, commitUuid, documentUuid])

  if (isPending) {
    return <Icon name='clock' color='foregroundMuted' />
  }

  if (isRunning) {
    return (
      <Tooltip
        asChild
        trigger={
          <Button
            variant='ghost'
            className='p-0'
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
              e.stopPropagation()
              stopExperiment()
            }}
          >
            <div className='flex flex-row gap-2 items-center'>
              {isHovered ? (
                <Icon name='circleStop' color='destructive' />
              ) : (
                <Icon name='loader' color='primary' spin />
              )}
              <Text.H5 noWrap color={isHovered ? 'destructive' : 'primary'}>
                {experiment.results.completed} / {experiment.metadata.count}
              </Text.H5>
            </div>
          </Button>
        }
      >
        Stop execution
      </Tooltip>
    )
  }

  return null
}
