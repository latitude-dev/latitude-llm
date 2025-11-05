'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import { useCompletedRuns } from '$/stores/runs/completedRuns'
import { RunSourceGroup } from '@latitude-data/constants'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { useMemo } from 'react'
import Link from 'next/link'
import { envClient } from '$/envClient'
import { DocsRoute } from '$/components/Documentation/routes'

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

  const docsUrl = `${envClient.NEXT_PUBLIC_DOCS_URL}${DocsRoute.IntegrationOverview}`

  return (
    <div className='flex flex-col gap-y-1 bg-accent border border-accent-foreground/10 rounded-xl p-4 cursor-pointer hover:bg-accent/80 transition-colors'>
      <Link href={docsUrl} target='_blank' className='block'>
        <Text.H5M color='accentForeground'>Integrate in production →</Text.H5M>
      </Link>
      <Text.H5 color='accentForeground'>
        This project has no production traces yet, integrate our SDK in 1 minute
        to see real data
      </Text.H5>
    </div>
  )
}
