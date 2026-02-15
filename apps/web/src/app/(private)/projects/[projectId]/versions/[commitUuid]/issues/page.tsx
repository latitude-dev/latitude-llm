import { IssuesDashboard } from './_components/IssuesDashboard'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { getAbsoluteIssuesCount } from '@latitude-data/core/queries/issues/getAbsoluteIssuesCount'
import { findIssueWithStats } from '@latitude-data/core/queries/issues/findWithStats'
import { fetchIssuesFiltered } from '@latitude-data/core/queries/issues/fetchIssuesFiltered'
import {
  buildIssuesCacheKey,
  convertIssuesParamsToQueryParams,
  parseIssuesQueryParams,
  QueryParams,
} from '@latitude-data/constants/issues'
import { SWRProvider } from '$/components/Providers/SWRProvider'
import { LockedIssuesDashboard } from './_components/LockedIssuesDashboard'

export type IssuesServerResponse = Awaited<
  ReturnType<typeof fetchIssuesFiltered>
>
type IssueWithStats = IssuesServerResponse['issues'][0]

export default async function IssuesPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  searchParams: Promise<QueryParams>
}) {
  let selectedIssue: IssueWithStats | null = null
  const session = await getCurrentUserOrRedirect()
  const queryParams = await searchParams
  const { projectId, commitUuid } = await params
  const project = await findProjectCached({
    workspaceId: session.workspace.id,
    projectId: Number(projectId),
  })

  const absoluteCount = await getAbsoluteIssuesCount({
    workspaceId: session.workspace.id,
    project,
  })
  if (absoluteCount === 0) {
    return (
      <LockedIssuesDashboard
        projectId={Number(projectId)}
        commitUuid={commitUuid}
      />
    )
  }

  const commit = await findCommitCached({
    uuid: commitUuid,
    projectId: Number(projectId),
  })
  const issueId = Number(String(queryParams.issueId))
  if (issueId) {
    selectedIssue = await findIssueWithStats({
      workspaceId: session.workspace.id,
      project,
      issueId,
    })
  }

  const parsedParams = parseIssuesQueryParams({
    params: queryParams,
  })
  const args = {
    project,
    commit,
    filters: parsedParams.filters,
    sorting: parsedParams.sorting,
    page: parsedParams.page,
  }
  const serverResponse = await fetchIssuesFiltered({
    workspaceId: session.workspace.id,
    ...args,
    limit: parsedParams.limit,
  })

  const key = buildIssuesCacheKey({
    projectId: project.id,
    commitUuid: commit.uuid,
    searchParams: convertIssuesParamsToQueryParams(parsedParams),
  })

  return (
    <SWRProvider config={{ [key]: serverResponse }}>
      <IssuesDashboard
        serverResponse={serverResponse}
        params={parsedParams}
        selectedIssue={selectedIssue ?? undefined}
      />
    </SWRProvider>
  )
}
