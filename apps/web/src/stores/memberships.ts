'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { MembershipWithUser } from '@latitude-data/core/queries/memberships/findAll'

export function useMemberships(opts?: SWRConfiguration) {
  const route = API_ROUTES.memberships.root
  const fetcher = useFetcher<MembershipWithUser[]>(route)
  const { data = [], ...rest } = useSWR<MembershipWithUser[]>(
    'memberships',
    fetcher,
    opts,
  )

  const byId = useMemo(() => {
    const map = new Map<number, MembershipWithUser>()
    for (const m of data) {
      map.set(m.id, m)
    }
    return map
  }, [data])

  return useMemo(() => ({ data, byId, ...rest }), [data, byId, rest])
}
