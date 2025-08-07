'use client'

import { updateUserAction } from '$/actions/user/update'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import type { User } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { type SWRConfiguration } from 'swr'

export function useCurrentUser(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const route = ROUTES.api.users.current
  const fetcher = useFetcher<User>(route, { fallback: null })

  const { data = undefined, mutate, isLoading } = useSWR<User>(compact(route), fetcher, opts)

  const { execute: executeUpdateEditorMode, isPending: isUpdatingEditorMode } = useLatitudeAction(
    updateUserAction,
    {
      onSuccess: async ({ data: user }) => {
        mutate(user) // Note: silent update
      },
      onError: async (error) => {
        toast({
          title: 'Error updating editor mode',
          description: error?.err?.message,
          variant: 'destructive',
        })
      },
    },
  )
  const updateEditorMode = useCallback(
    async ({ devMode }: { devMode: boolean }) => {
      return await executeUpdateEditorMode({ devMode })
    },
    [executeUpdateEditorMode],
  )

  return useMemo(
    () => ({ data, mutate, updateEditorMode, isUpdatingEditorMode, isLoading }),
    [data, mutate, updateEditorMode, isUpdatingEditorMode, isLoading],
  )
}
