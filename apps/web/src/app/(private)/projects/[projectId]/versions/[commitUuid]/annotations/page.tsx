'use server'

import {
  DEFAULT_PAGINATION_SIZE,
  RunSourceGroup,
  SpanType,
} from '@latitude-data/core/constants'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { RunsPage as ClientRunsPage } from './_components/RunsPage'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { mapSourceGroupToLogSources } from '@latitude-data/core/services/runs/mapSourceGroupToLogSources'
import { SpansRepository } from '@latitude-data/core/repositories'

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
  const logSources = mapSourceGroupToLogSources(sourceGroup as RunSourceGroup)
  const spansRepo = new SpansRepository(workspace.id)
  const result = await spansRepo
    .findByProjectLimited({
      projectId,
      types: [SpanType.Prompt, SpanType.External],
      source: logSources,
      limit: DEFAULT_PAGINATION_SIZE,
    })
    .then((r) => r.unwrap())

  return (
    <ClientRunsPage
      initialSpans={result.items}
      defaultSourceGroup={(sourceGroup as RunSourceGroup) ?? defaultSourceGroup}
      issuesEnabled={issuesEnabled}
    />
  )
}
