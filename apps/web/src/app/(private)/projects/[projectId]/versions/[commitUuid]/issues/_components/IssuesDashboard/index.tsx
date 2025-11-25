'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  useIssues,
  serializeIssue,
  Issue as IssueWithStats,
} from '$/stores/issues'
import {
  SafeIssuesParams,
  convertIssuesParamsToQueryParams,
} from '@latitude-data/constants/issues'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { useOnce } from '$/hooks/useMount'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
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
  selectedIssue?: IssueWithStats
}) {
  const { selectedElement, onSelectChange } = useSelectedFromUrl({
    serverSelected: serverSelectedIssue
      ? serializeIssue(serverSelectedIssue)
      : undefined,
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

  useOnce(() => {
    initServerData({
      projectId: project.id,
      commitUuid: commit.uuid,
      serverParams: params,
      serverResponse,
    })

    const issueIds = serverResponse.issues.map((issue) => issue.id)
    fetchMiniStatsInBatch({ issueIds })

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
        takeVertialSpace
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
