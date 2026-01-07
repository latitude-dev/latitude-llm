'use client'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { ExperimentBadge } from './ExperimentBadge'
import { OptimizationStatus } from './shared'
import { VersionBadge } from './VersionBadge'

export function OptimizedCell({
  commit,
  experiment,
  baselineExperimentUuid,
  optimizedExperimentUuid,
  status,
  hasExecutedAt,
  hasValidatedAt,
  hasError,
}: {
  commit?: Commit
  experiment?: ExperimentDto
  baselineExperimentUuid?: string
  optimizedExperimentUuid?: string
  status: OptimizationStatus
  hasExecutedAt: boolean
  hasValidatedAt: boolean
  hasError: boolean
}) {
  return (
    <div className='flex flex-row gap-2 items-center overflow-hidden'>
      <VersionBadge
        commit={commit}
        isPending={status === 'optimizing'}
        isFinished={!!hasExecutedAt}
        hasError={hasError}
        showTitle={false}
      />
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
