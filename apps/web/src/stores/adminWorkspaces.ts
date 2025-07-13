import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'

type AdminWorkspace = {
  id: number
  name: string
  createdAt: Date
}

export default function useAdminWorkspaces(opts?: SWRConfiguration) {
  const key = 'api/admin/workspaces'
  const fetcher = useFetcher<AdminWorkspace[]>(API_ROUTES.admin.workspaces.root)
  const { data = [], ...rest } = useSWR<AdminWorkspace[]>(key, fetcher, opts)

  return useMemo(
    () => ({
      data,
      ...rest,
    }),
    [data, rest],
  )
}
