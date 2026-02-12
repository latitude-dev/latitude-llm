'use server'

import {
  DEFAULT_PAGINATION_SIZE,
  MAIN_SPAN_TYPES,
  RunSourceGroup,
} from '@latitude-data/core/constants'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { AnnotationsPage as ClientAnnotationsPage } from './_components/AnnotationsPage'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { mapSourceGroupToLogSources } from '@latitude-data/core/services/runs/mapSourceGroupToLogSources'
import { findSpansByProjectLimited } from '@latitude-data/core/queries/spans/findByProjectLimited'

export default async function AnnotationsPage({
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
  const logSources = mapSourceGroupToLogSources(sourceGroup as RunSourceGroup)
  const result = await findSpansByProjectLimited({
    workspaceId: workspace.id,
    projectId,
    types: Array.from(MAIN_SPAN_TYPES),
    source: logSources,
    limit: DEFAULT_PAGINATION_SIZE,
  })

  return (
    <ClientAnnotationsPage
      initialSpans={result.items}
      defaultSourceGroup={(sourceGroup as RunSourceGroup) ?? defaultSourceGroup}
      issuesEnabled={issuesEnabled}
    />
  )
}
