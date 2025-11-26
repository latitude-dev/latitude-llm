'use client'

import { updateUserAction } from '$/actions/user/update'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { CurrentUser } from '$/app/api/users/current/route'
import { updateEscalatingIssuesEmailPreferenceAction } from '$/actions/memberships/updateEscalatingIssuesEmailPreference'
import { updateWeeklyEmailPreferenceAction } from '$/actions/memberships/updateWeeklyEmailPreference'

export function useCurrentUser(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const route = ROUTES.api.users.current
  const fetcher = useFetcher<CurrentUser>(route, { fallback: null })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<CurrentUser>(compact(route), fetcher, opts)

  const { execute: executeUpdateEditorMode, isPending: isUpdatingEditorMode } =
    useLatitudeAction(updateUserAction, {
      onSuccess: async () => {
        mutate() // Get fresh data
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

  const { execute: updateWeeklyEmail, isPending: isUpdatingWeeklyEmail } =
    useLatitudeAction(updateWeeklyEmailPreferenceAction, {
      onSuccess: async ({ data: updatedMembership }) => {
        toast({
          title: 'Success',
          description: 'Weekly email preference updated successfully',
        })
        mutate({
          ...data!,
          notifications: {
            ...data!.notifications,
            wantToReceiveWeeklyEmail:
              updatedMembership.wantToReceiveWeeklyEmail,
          },
        })
      },
      onError: async (error) => {
        toast({
          title: 'Error',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })

  const {
    execute: updateEscalatingIssuesEmail,
    isPending: isUpdatingEscalatingIssuesEmail,
  } = useLatitudeAction(updateEscalatingIssuesEmailPreferenceAction, {
    onSuccess: async ({ data: updatedMembership }) => {
      toast({
        title: 'Success',
        description: 'Issue email preference updated successfully',
      })
      mutate({
        ...data!,
        notifications: {
          ...data!.notifications,
          wantToReceiveEscalatingIssuesEmail:
            updatedMembership.wantToReceiveEscalatingIssuesEmail,
        },
      })
    },
    onError: async (error) => {
      toast({
        title: 'Error',
        description: error?.message,
        variant: 'destructive',
      })
    },
  })

  return useMemo(
    () => ({
      data,
      mutate,
      updateEditorMode,
      isUpdatingEditorMode,
      updateWeeklyEmail,
      isUpdatingWeeklyEmail,
      updateEscalatingIssuesEmail,
      isUpdatingEscalatingIssuesEmail,
      ...rest,
    }),
    [
      data,
      mutate,
      updateEditorMode,
      isUpdatingEditorMode,
      rest,
      updateWeeklyEmail,
      isUpdatingWeeklyEmail,
      updateEscalatingIssuesEmail,
      isUpdatingEscalatingIssuesEmail,
    ],
  )
}
