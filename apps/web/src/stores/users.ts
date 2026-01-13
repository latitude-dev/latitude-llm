import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { destroyMembershipAction } from '$/actions/memberships/destroy'
import { updateMembershipRoleAction } from '$/actions/memberships/updateRole'
import { inviteUserAction } from '$/actions/user/invite'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { WorkspaceUser } from '@latitude-data/core/repositories'

export type SerializedWorkspaceUser = Omit<
  WorkspaceUser,
  'createdAt' | 'updatedAt' | 'confirmedAt'
> & {
  createdAt: Date
  updatedAt: Date
  confirmedAt: Date | null
}
export default function useUsers(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = useFetcher<SerializedWorkspaceUser[], WorkspaceUser[]>(
    ROUTES.api.users.root,
    {
      serializer: (rows) => rows.map(deserialize),
    },
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<SerializedWorkspaceUser[], WorkspaceUser[]>(
    'api/users',
    fetcher,
    opts,
  )
  const { execute: invite } = useLatitudeAction(inviteUserAction, {
    onSuccess: async () => {
      toast({
        title: 'Success',
        description: 'User invited successfully',
      })

      await mutate()
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

  const { execute: updateRole } = useLatitudeAction(
    updateMembershipRoleAction,
    {
      onSuccess: ({ data: membership }) => {
        toast({
          title: 'Success',
          description: 'Role updated successfully',
        })

        mutate(
          data.map((user) =>
            user.id === membership.userId
              ? { ...user, role: membership.role }
              : user,
          ),
        )
      },
    },
  )

  return { data, mutate, invite, destroy, updateRole, ...rest }
}

function deserialize(item: WorkspaceUser): SerializedWorkspaceUser {
  return {
    ...item,
    confirmedAt: item.confirmedAt ? new Date(item.confirmedAt) : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
