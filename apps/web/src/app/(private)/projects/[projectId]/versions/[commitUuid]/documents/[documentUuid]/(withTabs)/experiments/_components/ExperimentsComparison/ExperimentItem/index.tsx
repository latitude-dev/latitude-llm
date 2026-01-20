import { stopExperimentAction } from '$/actions/experiments'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import {
  BestLogsMetadata,
  EvaluationWithBestExperiment,
} from '$/stores/experimentComparison'
import { DocumentVersion } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback } from 'react'
import { ActionButtons } from './ActionButtons'
import {
  ExperimentEvaluationScores,
  ExperimentEvaluationScoresPlaceholder,
} from './EvaluationScores'
import {
  ExperimentLogsMetadata,
  ExperimentLogsMetadataPlaceholder,
} from './LogsMetadata'
import { ExperimentPrompt } from './Prompt'

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
  isFirst,
  isLast,
  isSamePrompt,
  onUnselect,
  onCompare,
}: {
  experiment?: ExperimentWithScores
  evaluations?: EvaluationWithBestExperiment[]
  bestLogsMetadata: BestLogsMetadata
  isFirst: boolean
  isLast: boolean
  isSamePrompt: boolean
  onUnselect?: () => void
  onCompare?: () => void
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
        <div className='w-full truncate'>
          <Text.H4B ellipsis noWrap>
            {experiment.name}
          </Text.H4B>
        </div>
        {!experiment.finishedAt && (
          <Button
            variant='outlineDestructive'
            iconProps={{
              name: 'circleStop',
              className: 'shrink-0',
            }}
            onClick={stopExperiment}
          >
            Cancel
          </Button>
        )}
        {onUnselect && (
          <Button
            variant='ghost'
            iconProps={{
              name: 'close',
              color: 'foregroundMuted',
              className: 'shrink-0',
            }}
            onClick={onUnselect}
            className='p-0'
          />
        )}
      </div>
      <ExperimentPrompt
        experiment={experiment}
        onCompare={isFirst ? undefined : onCompare}
        isSamePrompt={isSamePrompt}
      />
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
