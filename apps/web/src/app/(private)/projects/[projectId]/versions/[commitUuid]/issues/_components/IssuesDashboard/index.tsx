'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useIssues } from '$/stores/issues'
import {
  SafeIssuesParams,
  convertIssuesParamsToQueryParams,
} from '@latitude-data/constants/issues'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { useOnce } from '$/hooks/useMount'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useFetchMiniHistgramsInBatch } from '$/stores/issues/histograms/miniStats'
import { useSelectedFromUrl } from '$/hooks/useSelectedFromUrl'
import { ROUTES } from '$/services/routes'
import { IssuesServerResponse } from '../../page'
import { IssuesTable } from '../IssuesTable'
import { IssuesFilters } from '../IssuesFilters'
import { SearchIssuesInput } from '../SearchIssuesInput'

export function IssuesDashboard({
  serverResponse,
  params,
  selectedIssue: serverSelectedIssue,
}: {
  serverResponse: IssuesServerResponse
  params: SafeIssuesParams
  selectedIssue?: Issue
}) {
  const { selectedElement, onSelectChange } = useSelectedFromUrl({
    serverSelected: serverSelectedIssue,
    keyField: 'id',
    paramsUrlName: 'issueId',
  })
  const { loadingMiniStats, fetchMiniStatsInBatch } =
    useFetchMiniHistgramsInBatch()
  const { init, urlParameters, onSuccessIssuesFetch } = useIssuesParameters(
    (state) => ({
      init: state.init,
      urlParameters: state.urlParameters,
      onSuccessIssuesFetch: state.onSuccessIssuesFetch,
    }),
  )
  const queryParams = useSearchParams()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const page = Number(queryParams.get('page') ?? '1')
  const initialPage = useRef(page)
  const currentRoute = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid }).issues.root
  const searchParams = useMemo(() => {
    if (!urlParameters) return convertIssuesParamsToQueryParams(params)

    return urlParameters
  }, [urlParameters, params])
  const onSuccess = useCallback(
    async (data: IssuesServerResponse | void) => {
      if (!data) return

      const issueIds = data.issues.map((issue) => issue.id)
      await fetchMiniStatsInBatch({ issueIds })
      onSuccessIssuesFetch(data)
    },
    [onSuccessIssuesFetch, fetchMiniStatsInBatch],
  )
  const {
    data: issues,
    isLoading,
    initServerData,
  } = useIssues(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      searchParams,
      initialPage: initialPage.current,
      onSuccess,
    },
    {
      fallbackData: serverResponse,
    },
  )
  // const issueIds = useMemo(
  //   () => issues?.map((issue) => issue.id) ?? [],
  //   [issues],
  // )
  //
  // useEffect(() => {
  //   fetchMiniStatsInBatch({ issueIds })
  // }, [issueIds, fetchMiniStatsInBatch])

  useOnce(() => {
    // Initialize server data for SWR
    initServerData({
      projectId: project.id,
      commitUuid: commit.uuid,
      serverParams: params,
      serverResponse,
    })

    // Fetch histogram mini stats
    const issueIds = serverResponse.issues.map((issue) => issue.id)
    fetchMiniStatsInBatch({ issueIds })

    // Init Zustand params
    init({
      params: {
        ...params,
        totalCount: serverResponse.totalCount,
      },
      onStateChange: (queryParams) => {
        onSelectChange(undefined)
        window.history.replaceState(
          null,
          '',
          `${currentRoute}?${new URLSearchParams(queryParams).toString()}`,
        )
      },
    })
  })

  return (
    <div className='flex flex-grow flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title={<SearchIssuesInput serverParams={params} />}
        actions={<IssuesFilters serverParams={params} />}
        table={
          <IssuesTable
            issues={issues}
            isLoading={isLoading}
            currentRoute={currentRoute}
            serverParams={params}
            loadingMiniStats={loadingMiniStats}
            selectedIssue={selectedElement}
            onSelectChange={onSelectChange}
          />
        }
      />
    </div>
  )
}
