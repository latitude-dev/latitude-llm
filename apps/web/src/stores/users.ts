import type { User } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { destroyMembershipAction } from '$/actions/memberships/destroy'
import { inviteUserAction } from '$/actions/users/invite'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type SerializedUser = Omit<User, 'createdAt' | 'updatedAt' | 'confirmedAt'> & {
  createdAt: Date
  updatedAt: Date
  confirmedAt: Date | null
}
export default function useUsers(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher<SerializedUser[], User[]>(ROUTES.api.users.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<SerializedUser[], User[]>('api/users', fetcher, opts)
  const { execute: invite } = useLatitudeAction(inviteUserAction, {
    onSuccess: ({ data: inviteOutcome }) => {
      // The NewUser component's useFormAction.onSuccess handles specific toasts.
      // Here, we only update the SWR cache if a user was actually added.
      if (inviteOutcome.status === 'user_added_to_workspace') {
        const newUser = deserialize(inviteOutcome.user)
        mutate([...data, newUser])
        // Toast for this specific case can remain or be managed by the component.
        // For consistency with how NewUser handles toasts, it might be better to let it manage all user-facing notifications.
        // However, if a general success toast for cache update is desired here, it can be added.
      }
      // If inviteOutcome.status === 'invitation_created', no change to the user list cache is needed.
      // The NewUser component will inform the user that an invitation was sent.
    },
  })
  const { execute: destroy } = useLatitudeAction(destroyMembershipAction, {
    onSuccess: ({ data: membership }) => {
      toast({
        title: 'Success',
        description: 'User removed successfully',
      })

      mutate(data.filter((user) => user.id !== membership.userId))
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
