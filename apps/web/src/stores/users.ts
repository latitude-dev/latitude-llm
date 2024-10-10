import type { User } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { destroyMembershipAction } from '$/actions/memberships/destroy'
import { inviteUserAction } from '$/actions/users/invite'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useUsers(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const fetcher = async () => {
    const response = await fetch(ROUTES.api.users.root)
    if (!response.ok) {
      const error = await response.json()

      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return []
    }

    return await response.json()
  }

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<User[]>('api/users', fetcher, opts)
  const { execute: invite } = useLatitudeAction(inviteUserAction, {
    onSuccess: ({ data: user }) => {
      toast({
        title: 'Success',
        description: 'User invited successfully',
      })

      mutate([...data, user])
    },
  })
  const { execute: destroy } = useLatitudeAction(destroyMembershipAction, {
    onSuccess: ({ data: membership }) => {
      toast({
        title: 'Success',
        description: 'User removed successfully',
      })

      mutate(data.filter((user) => user.id === membership.userId))
    },
  })

  return { data, mutate, invite, destroy, ...rest }
}
