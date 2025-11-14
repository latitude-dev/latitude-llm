import { DocumentRoutes, ROUTES } from '$/services/routes'
import { DocumentVersion } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
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
            .commits.detail({ uuid: commit.uuid })
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
