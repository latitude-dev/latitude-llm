'use client'

import { Usable, use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useUsers from '$/stores/users'

export default function DestroyUserMembership({
  params,
}: {
  params: Usable<{ userId: string }>
}) {
  const { userId } = use(params)
  const navigate = useNavigate()
  const { data, destroy } = useUsers()
  const user = data.find((u) => u.id === userId)

  if (!user) return null

  return (
    <DestroyModal
      title='Remove user'
      description={`Are you sure you want to remove ${user?.name} from this workspace? You will be able to invite them again.`}
      onOpenChange={(open: boolean) =>
        !open && navigate.push(ROUTES.settings.root)
      }
      action={destroy}
      submitStr={`Remove ${user?.name}`}
      model={user}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
    />
  )
}
