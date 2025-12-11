'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { RunSourceGroup, SpanType } from '@latitude-data/constants'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { useMemo } from 'react'
import Link from 'next/link'
import { envClient } from '$/envClient'
import { DocsRoute } from '$/components/Documentation/routes'
import { mapSourceGroupToLogSources } from '@latitude-data/core/services/runs/mapSourceGroupToLogSources'

export default function ProductionBanner({ project }: { project: Project }) {
  const { items, isLoading } = useSpansKeysetPaginationStore(
    {
      projectId: project.id.toString(),
      types: [SpanType.Prompt, SpanType.External],
      source: mapSourceGroupToLogSources(RunSourceGroup.Production),
      limit: 1,
    },
    { revalidateOnFocus: false },
  )

  const hasProductionRuns = useMemo(() => items.length > 0, [items])

  if (isLoading || hasProductionRuns) return null

  const docsUrl = `${envClient.NEXT_PUBLIC_DOCS_URL}${DocsRoute.IntegrationOverview}`

  return (
    <Link href={docsUrl} target='_blank' className='block'>
      <div className='flex flex-col gap-y-1 bg-accent border border-accent-foreground/10 rounded-xl p-4 cursor-pointer hover:bg-accent/80 transition-colors'>
        <Text.H5M color='accentForeground'>Integrate in production →</Text.H5M>
        <Text.H5 color='accentForeground'>
          This project has no production traces yet, integrate our SDK in 1
          minute to see real data
        </Text.H5>
      </div>
    </Link>
  )
}
