'use client'

import { issueGrantAction } from '$/actions/admin/grants/issue'
import { revokeGrantAction } from '$/actions/admin/grants/revoke'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { Grant } from '@latitude-data/core/schema/types'
import { Quota, QuotaType } from '@latitude-data/core/constants'

export function useGrantsAdmin(
  { workspaceId }: { workspaceId: number },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.admin.workspaces.detail(workspaceId).grants.root
  const fetcher = useFetcher<Grant[]>(route)

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Grant[]>(compact(route), fetcher, opts)

  const { execute: executeIssueGrant, isPending: isIssuingGrant } =
    useLatitudeAction(issueGrantAction, {
      onSuccess: async ({ data: grant }) => {
        mutate((prev) => [grant, ...(prev ?? [])])
      },
    })
  const issueGrant = useCallback(
    async (parameters: {
      type: QuotaType
      amount: Quota
      periods?: number
    }) => {
      return await executeIssueGrant({ ...parameters, workspaceId })
    },
    [workspaceId, executeIssueGrant],
  )

  const { execute: executeRevokeGrant, isPending: isRevokingGrant } =
    useLatitudeAction(revokeGrantAction, {
      onSuccess: async ({ data: grant }) => {
        mutate((prev) => prev?.filter((g) => g.id !== grant.id) ?? [])
      },
    })
  const revokeGrant = useCallback(
    async (parameters: { grantId: number }) => {
      return await executeRevokeGrant({ ...parameters, workspaceId })
    },
    [workspaceId, executeRevokeGrant],
  )

  return useMemo(
    () => ({
      data,
      mutate,
      issueGrant,
      isIssuingGrant,
      revokeGrant,
      isRevokingGrant,
      ...rest,
    }),
    [
      data,
      mutate,
      issueGrant,
      isIssuingGrant,
      revokeGrant,
      isRevokingGrant,
      rest,
    ],
  )
}
