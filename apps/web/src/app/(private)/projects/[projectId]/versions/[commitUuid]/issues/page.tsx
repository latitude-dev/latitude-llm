import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { issuesFiltersQueryParamsParser } from '@latitude-data/core/data-access/issues/parseFilters'
import { IssuesDashboard } from './_components/IssuesDashboard'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { IssuesRepository } from '@latitude-data/core/repositories'
import { OkType } from '@latitude-data/core/lib/Result'

export type IssuesServerResponse = Awaited<OkType<
  IssuesRepository['fetchIssuesFiltered']
>>

export default async function IssuesPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  searchParams: Promise<QueryParams>
}) {
  const parsed = issuesFiltersQueryParamsParser.parse(searchParams)
  const { projectId, commitUuid } = await params
  const session = await getCurrentUserOrRedirect()
  const project = await findProjectCached({
    workspaceId: session.workspace.id,
    projectId: Number(projectId),
  })
  const commit = await findCommitCached({
    uuid: commitUuid,
    projectId: Number(projectId),
  })
  const issuesRepo = new IssuesRepository(session.workspace.id)
  const data = await issuesRepo
    .fetchIssuesFiltered({
      project,
      commit,
      filters: parsed.filters,
      sorting: parsed.sorting,
      cursor: parsed.cursor,
      limit: parsed.limit,
    })
    .then((r) => r.unwrap())

  // SSR Issues Dashboard. Fetch data inside IssuesDashboard component.
  return (
    <IssuesDashboard
      serverData={data}
      filters={parsed.filters}
      sorting={parsed.sorting}
      cursor={parsed.cursor}
      limit={parsed.limit}
    />
  )
}
