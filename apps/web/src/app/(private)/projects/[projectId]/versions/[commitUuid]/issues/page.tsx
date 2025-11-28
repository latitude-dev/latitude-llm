import { IssuesDashboard } from './_components/IssuesDashboard'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { IssuesRepository } from '@latitude-data/core/repositories'
import { OkType } from '@latitude-data/core/lib/Result'
import {
  buildIssuesCacheKey,
  convertIssuesParamsToQueryParams,
  parseIssuesQueryParams,
  QueryParams,
} from '@latitude-data/constants/issues'
import { SWRProvider } from '$/components/Providers/SWRProvider'
import { LockedIssuesDashboard } from './_components/LockedIssuesDashboard'

export type IssuesServerResponse = Awaited<
  OkType<IssuesRepository['fetchIssuesFiltered']>
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

  if (!session.workspace.issuesUnlocked) {
    return (
      <LockedIssuesDashboard
        projectId={Number((await params).projectId)}
        commitUuid={(await params).commitUuid}
      />
    )
  }

  const queryParams = await searchParams
  const { projectId, commitUuid } = await params
  const project = await findProjectCached({
    workspaceId: session.workspace.id,
    projectId: Number(projectId),
  })
  const commit = await findCommitCached({
    uuid: commitUuid,
    projectId: Number(projectId),
  })
  const issuesRepo = new IssuesRepository(session.workspace.id)
  const issueId = Number(String(queryParams.issueId))
  if (issueId) {
    selectedIssue = await issuesRepo.findWithStats({ project, issueId })
  }

  // Filtering
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
  const serverResponse = await issuesRepo
    .fetchIssuesFiltered({
      ...args,
      limit: parsedParams.limit,
    })
    .then((r) => r.unwrap())

  if (serverResponse.totalCount === 0) {
    const absoluteCount = await issuesRepo.getAbsoluteIssuesCount({ project })
    if (absoluteCount === 0) {
      return (
        <LockedIssuesDashboard
          projectId={Number(projectId)}
          commitUuid={commitUuid}
        />
      )
    }
  }

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
