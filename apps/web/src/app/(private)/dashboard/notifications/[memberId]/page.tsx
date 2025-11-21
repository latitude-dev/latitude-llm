import { notFound, redirect } from 'next/navigation'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { switchWorkspace } from '@latitude-data/core/services/workspaces/switch'
import { MembershipsRepository } from '@latitude-data/core/repositories'

export default async function NotificationsByMemberIdPage({
  params,
}: {
  params: { memberId: string }
}) {
  const { user, workspace: currentWorkspace } = await getCurrentUserOrRedirect()
  const memberId = parseInt(params.memberId, 10)

  if (isNaN(memberId)) {
    notFound()
  }

  const repo = new MembershipsRepository(currentWorkspace.id)
  const membership = await repo.findAnyMembershipForUser({
    userId: user.id,
    membershipId: memberId,
  })

  // This membership does not belongs to the current user
  if (!membership) return notFound()

  if (membership.workspaceId === currentWorkspace.id) {
    redirect(ROUTES.dashboard.notifications.root)
  }

  // Otherwise, switch to the workspace and then redirect
  await switchWorkspace({ workspaceId: membership.workspaceId })
  redirect(ROUTES.dashboard.notifications.root)
}
