import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import {
  BestLogsMetadata,
  EvaluationWithBestExperiment,
} from '$/stores/experimentComparison'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ExperimentPrompt } from './Prompt'
import {
  ExperimentLogsMetadata,
  ExperimentLogsMetadataPlaceholder,
} from './LogsMetadata'
import {
  ExperimentEvaluationScores,
  ExperimentEvaluationScoresPlaceholder,
} from './EvaluationScores'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ActionButtons } from './ActionButtons'
import { DocumentVersion } from '@latitude-data/constants'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { stopExperimentAction } from '$/actions/experiments'
import { useCallback } from 'react'
import {
  Commit,
  ExperimentWithScores,
  Project,
} from '@latitude-data/core/schema/types'

export function ExperimentItemPlaceholder({
  isLast,
  evaluationCount,
}: {
  isLast?: boolean
  evaluationCount?: number
}) {
  return (
    <div
      className={cn(
        'w-full max-w-[40%] min-w-80 min-h-40 flex flex-col gap-4 p-4 border-border',
        {
          'border-r': !isLast,
        },
      )}
    >
      <Skeleton height='h4' className='w-[85%]' />
      <ExperimentPrompt experiment={undefined} />
      <ExperimentLogsMetadataPlaceholder />
      <ExperimentEvaluationScoresPlaceholder
        evaluationCount={evaluationCount}
      />
    </div>
  )
}

export function ExperimentItem({
  experiment,
  evaluations,
  bestLogsMetadata,
  isLast,
  onUnselect,
}: {
  experiment?: ExperimentWithScores
  evaluations?: EvaluationWithBestExperiment[]
  bestLogsMetadata: BestLogsMetadata
  isLast: boolean
  onUnselect?: () => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { execute } = useLatitudeAction(stopExperimentAction)
  const stopExperiment = useCallback(() => {
    if (!experiment) return
    execute({
      projectId: project.id,
      experimentUuid: experiment.uuid,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    })
  }, [experiment, execute, project.id, commit.uuid, document.documentUuid])

  if (!experiment) {
    return (
      <ExperimentItemPlaceholder
        isLast={isLast}
        evaluationCount={evaluations?.length}
      />
    )
  }

  return (
    <div
      className={cn(
        'w-full max-w-[40%] min-w-80 min-h-40 flex flex-col gap-4 p-4 border-border',
        {
          'border-r': !isLast,
        },
      )}
    >
      <div className='flex flex-row w-full items-center justify-between gap-4'>
        <div className='w-full'>
          <Text.H4B ellipsis noWrap>
            {experiment.name}
          </Text.H4B>
        </div>
        {!experiment.finishedAt && (
          <Button
            variant='outline'
            fancy
            className='border-destructive'
            onClick={stopExperiment}
            iconProps={{
              name: 'circleStop',
              color: 'destructive',
            }}
          >
            <Text.H5 noWrap color='destructive'>
              Stop Execution
            </Text.H5>
          </Button>
        )}
        {onUnselect && (
          <Button
            iconProps={{
              name: 'close',
              color: 'foregroundMuted',
            }}
            onClick={onUnselect}
            variant='ghost'
            className='p-0'
          />
        )}
      </div>
      <ExperimentPrompt experiment={experiment} />
      <ExperimentLogsMetadata
        experiment={experiment}
        bestLogsMetadata={bestLogsMetadata}
      />
      <ExperimentEvaluationScores
        experiment={experiment}
        evaluations={evaluations}
      />
      <ActionButtons
        project={project as Project}
        commit={commit as Commit}
        document={document as DocumentVersion}
        experiment={experiment}
      />
    </div>
  )
}
