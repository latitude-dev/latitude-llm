'use client'

import { useMemo, useRef } from 'react'
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
import { ROUTES } from '$/services/routes'
import { IssuesServerResponse } from '../../page'
import { IssuesTable } from '../IssuesTable'
import { IssuesFilters } from '../IssuesFilters'
import { SearchIssuesInput } from '../SearchIssuesInput'

export function IssuesDashboard({
  serverResponse,
  params,
}: {
  serverResponse: IssuesServerResponse
  params: SafeIssuesParams
}) {
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
  const { data: issues, isLoading } = useIssues(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      searchParams,
      initialPage: initialPage.current,
      onSuccess: onSuccessIssuesFetch,
    },
    {
      fallbackData: serverResponse,
    },
  )

  useOnce(() => {
    init({
      params: {
        ...params,
        totalCount: serverResponse.totalCount,
      },
      onStateChange: (queryParams) => {
        // NOTE: Next.js do RSC navigation, so we need to use the History API to avoid a full page reload
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
          />
        }
      />
    </div>
  )
}
