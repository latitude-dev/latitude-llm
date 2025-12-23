import { DocumentRoutes, ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import { DocumentVersion } from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'
import { useMemo } from 'react'

function InnerApplyButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button variant='outline' fullWidth disabled={disabled} fancy>
      Use prompt
    </Button>
  )
}

function ApplyButton({
  project,
  commit,
  document,
  experiment,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  experiment: ExperimentWithScores
}) {
  const disabledMessage =
    document.content === experiment.metadata.prompt
      ? 'This prompt is already being used'
      : commit.mergedAt
        ? 'Create a draft to apply this prompt'
        : undefined

  if (disabledMessage) {
    return (
      <Tooltip
        asChild
        trigger={
          <div className='w-full'>
            <InnerApplyButton disabled />
          </div>
        }
      >
        {disabledMessage}
      </Tooltip>
    )
  }

  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: project.id })
          .commits.detail({ uuid: commit.uuid })
          .documents.detail({ uuid: document.documentUuid }).root +
        `?applyExperimentId=${experiment.id}`
      }
      className='w-full'
    >
      <InnerApplyButton />
    </Link>
  )
}

export function ActionButtons({
  project,
  commit,
  document,
  experiment,
}: {
  project: Project
  commit: Commit
  document: DocumentVersion
  experiment: ExperimentWithScores
}) {
  const { data: commits } = useCommits()

  const experimentCommit = useMemo(() => {
    return commits?.find((c) => c.id === experiment.commitId)
  }, [commits, experiment.commitId])

  return (
    <div className='flex flex-row justify-center w-full gap-2'>
      <ApplyButton
        project={project}
        commit={commit}
        document={document}
        experiment={experiment}
      />
      <Link
        href={
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: experimentCommit?.uuid ?? commit.uuid })
            .documents.detail({ uuid: document.documentUuid })[
            DocumentRoutes.traces
          ].root +
          `?filters=${encodeURIComponent(
            JSON.stringify({ experimentUuids: [experiment.uuid] }),
          )}`
        }
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
  )
}
