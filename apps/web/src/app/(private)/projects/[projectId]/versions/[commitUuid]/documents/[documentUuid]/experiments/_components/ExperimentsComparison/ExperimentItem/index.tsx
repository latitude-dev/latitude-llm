import { ExperimentWithScores } from '@latitude-data/core/browser'
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
import Link from 'next/link'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

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
        <Text.H4B ellipsis noWrap>
          {experiment.name}
        </Text.H4B>
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
      <div className='flex flex-row items-center justify-center w-full'>
        <Link
          href={ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid })
            [DocumentRoutes.logs].withFilters({
              experimentId: experiment.id,
            })}
          className='w-full'
        >
          <Button
            variant='outline'
            fullWidth
            fancy
            iconProps={{
              name: 'externalLink',
              placement: 'right',
            }}
          >
            See {experiment.logsMetadata.count} Logs
          </Button>
        </Link>
      </div>
    </div>
  )
}
