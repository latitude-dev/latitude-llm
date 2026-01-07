'use client'

import { ScoreCell } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/experiments/_components/ExperimentsTable/ScoreCell'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import Link from 'next/link'
import { OptimizationStatus } from './shared'

export function ExperimentBadge({
  experiment,
  baselineExperimentUuid,
  optimizedExperimentUuid,
  status,
  hasValidatedAt,
}: {
  experiment?: ExperimentDto
  baselineExperimentUuid?: string
  optimizedExperimentUuid?: string
  status?: OptimizationStatus
  hasValidatedAt?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  if (experiment?.finishedAt) {
    const href = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .experiments.withSelected([baselineExperimentUuid, optimizedExperimentUuid]) // prettier-ignore

    return (
      <Link href={href} target='_blank' onClick={(e) => e.stopPropagation()}>
        <ScoreCell experiment={experiment} icon='externalLink' hideWhenEmpty />
      </Link>
    )
  }

  if (hasValidatedAt) {
    return null
  }

  if (status === 'validating') {
    return <Skeleton height='h3' className='w-16 rounded-md' />
  }

  return null
}
