import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { WorkspaceSwitcherRedirect } from './_components/WorkspaceSwitcherRedirect'
import { ROUTES } from '$/services/routes'
import { database } from '@latitude-data/core/client'
import { memberships } from '@latitude-data/core/schema/models/memberships'

async function findAnyMembershipForUser({
  userId,
  membershipId,
}: {
  userId: string
  membershipId: number
}) {
  return database
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.id, membershipId)),
    )
    .then((res) => res[0])
}

export default async function NotificationsByMemberIdPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const paramsResolved = await params
  const { user: currentUser, workspace: currentWorkspace } =
    await getCurrentUserOrRedirect()
  const memberId = parseInt(paramsResolved.memberId, 10)
  const membership = await findAnyMembershipForUser({
    userId: currentUser.id,
    membershipId: memberId,
  })

  if (!membership) return notFound()
  if (membership.workspaceId === currentWorkspace.id) {
    return redirect(ROUTES.dashboard.notifications.root)
  }

  return (
    <WorkspaceSwitcherRedirect targetWorkspaceId={membership.workspaceId} />
  )
}
