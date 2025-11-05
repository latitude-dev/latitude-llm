'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import { useCompletedRuns } from '$/stores/runs/completedRuns'
import { RunSourceGroup } from '@latitude-data/constants'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { useMemo } from 'react'

export default function ProductionBanner({ project }: { project: Project }) {
  const { data: activeRuns } = useActiveRuns({
    project,
    search: { sourceGroup: RunSourceGroup.Production },
  })
  const { data: completedRuns } = useCompletedRuns({
    project,
    search: { sourceGroup: RunSourceGroup.Production },
  })

  const hasProductionRuns = useMemo(
    () => activeRuns.length > 0 || completedRuns.length > 0,
    [activeRuns, completedRuns],
  )

  if (hasProductionRuns) return null

  return (
    <div className='flex flex-col gap-y-1 bg-accent border border-accent-foreground/10 rounded-xl p-4'>
      <Text.H5M color='accentForeground'>Integrate in production →</Text.H5M>
      <Text.H5 color='accentForeground'>
        This project has no production traces yet, integrate our SDK in 1 minute
        to see real data
      </Text.H5>
    </div>
  )
}
