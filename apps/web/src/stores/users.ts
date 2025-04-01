import type { User } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { destroyMembershipAction } from '$/actions/memberships/destroy'
import { inviteUserAction } from '$/actions/users/invite'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useUsers(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.users.root, {
    serializer: (rows) => rows.map(deserialize),
  })
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

function deserialize(item: User) {
  return {
    ...item,
    confirmedAt: item.confirmedAt ? new Date(item.confirmedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
