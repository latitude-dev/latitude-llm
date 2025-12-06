'use server'

import { listPromptSpansCached } from '$/app/(private)/_data-access'
import {
  DEFAULT_PAGINATION_SIZE,
  RunSourceGroup,
} from '@latitude-data/core/constants'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { RunsPage as ClientRunsPage } from './_components/RunsPage'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId: _projectId } = await params
  const { sourceGroup } = await searchParams

  const defaultSourceGroup = RunSourceGroup.Production
  const { workspace } = await getCurrentUserOrRedirect()
  const issuesEnabled = await isFeatureEnabledByName(
    workspace.id,
    'issues',
  ).then((r) => r.unwrap())

  const projectId = Number(_projectId)
  const result = await listPromptSpansCached({
    projectId,
    limit: DEFAULT_PAGINATION_SIZE,
    sourceGroup: (sourceGroup as RunSourceGroup) ?? defaultSourceGroup,
  })

  return (
    <ClientRunsPage
      initialSpans={result.items}
      defaultSourceGroup={(sourceGroup as RunSourceGroup) ?? defaultSourceGroup}
      issuesEnabled={issuesEnabled}
    />
  )
}
