'use client'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { ExperimentBadge } from './ExperimentBadge'
import { OptimizationStatus } from './shared'
import { VersionBadge } from './VersionBadge'

export function BaselineCell({
  commit,
  experiment,
  baselineExperimentUuid,
  optimizedExperimentUuid,
  status,
  hasValidatedAt,
  hasError,
}: {
  commit?: Commit
  experiment?: ExperimentDto
  baselineExperimentUuid?: string
  optimizedExperimentUuid?: string
  status: OptimizationStatus
  hasValidatedAt: boolean
  hasError: boolean
}) {
  return (
    <div className='flex flex-row gap-2 items-center overflow-hidden'>
      <VersionBadge commit={commit} hasError={hasError} />
      <ExperimentBadge
        experiment={experiment}
        baselineExperimentUuid={baselineExperimentUuid}
        optimizedExperimentUuid={optimizedExperimentUuid}
        status={status}
        hasValidatedAt={hasValidatedAt}
      />
    </div>
  )
}
