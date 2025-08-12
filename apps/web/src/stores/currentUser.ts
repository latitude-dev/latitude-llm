'use client'

import { updateUserAction } from '$/actions/user/update'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { User } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useCurrentUser(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const route = ROUTES.api.users.current
  const fetcher = useFetcher<User>(route, { fallback: null })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<User>(compact(route), fetcher, opts)

  const { execute: executeUpdateEditorMode, isPending: isUpdatingEditorMode } =
    useLatitudeAction(updateUserAction, {
      onSuccess: async ({ data: user }) => {
        mutate(user) // Note: silent update
      },
      onError: async (error) => {
        toast({
          title: 'Error updating editor mode',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })
  const updateEditorMode = useCallback(
    async ({ devMode }: { devMode: boolean }) => {
      return await executeUpdateEditorMode({ devMode })
    },
    [executeUpdateEditorMode],
  )

  return useMemo(
    () => ({ data, mutate, updateEditorMode, isUpdatingEditorMode, ...rest }),
    [data, mutate, updateEditorMode, isUpdatingEditorMode, rest],
  )
}
