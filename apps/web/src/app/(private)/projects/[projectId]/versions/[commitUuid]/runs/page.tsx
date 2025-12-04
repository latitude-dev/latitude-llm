'use server'

import {
  getDocumentLogsApproximatedCountByProjectCached,
  listCompletedRunsCached,
} from '$/app/(private)/_data-access'
import {
  DEFAULT_PAGINATION_SIZE,
  LIMITED_VIEW_THRESHOLD,
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
  const completedSearch = {
    sourceGroup: (sourceGroup as RunSourceGroup) ?? defaultSourceGroup,
  }

  const completedRuns = await listCompletedRunsCached({ projectId, limit: DEFAULT_PAGINATION_SIZE, ...completedSearch }) // prettier-ignore

  let limitedView = undefined
  const approximatedCount = await getDocumentLogsApproximatedCountByProjectCached(projectId) // prettier-ignore
  if (approximatedCount > LIMITED_VIEW_THRESHOLD) {
    limitedView = { totalRuns: approximatedCount }
  }

  return (
    <ClientRunsPage
      issuesEnabled={issuesEnabled}
      completed={{ runs: completedRuns.items }}
      limitedView={limitedView}
      defaultSourceGroup={(sourceGroup as RunSourceGroup) ?? defaultSourceGroup}
    />
  )
}
