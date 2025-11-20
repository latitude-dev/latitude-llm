import { notFound, redirect } from 'next/navigation'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { WorkspaceSwitcherRedirect } from './_components/WorkspaceSwitcherRedirect'
import { ROUTES } from '$/services/routes'
import { WorkspacesRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'

/**
 * Handle notifications page by workspace id
 *
 * 1. If this workspace is valid we find if the user in the current session
 * (if any) has a membership in that workspace. If not current session we
 * redirect to login page with `redirectTo` param set to this page.
 *
 * 2. If the user has a membership in that workspace but is not the current
 * workspace we render workspace switcher redirect component to switch to that
 * so frontend can set the right session in cookies.
 *
 * 3. If the user has membership to that workspace and it's the current workspace
 * we redirect to the default notifications page
 *
 */
export default async function NotificationsByWorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { user: currentUser, workspace: currentWorkspace } =
    await getCurrentUserOrRedirect()

  const paramsResolved = await params
  const workspaceId = parseInt(paramsResolved.workspaceId, 10)
  const workspaceRepo = new WorkspacesRepository(currentUser.id)
  const workspaceResult = await workspaceRepo.find(workspaceId)

  if (!Result.isOk(workspaceResult)) return notFound()

  const workspace = workspaceResult.value
  if (workspace.id === currentWorkspace.id) {
    return redirect(ROUTES.dashboard.notifications.root)
  }

  return <WorkspaceSwitcherRedirect targetWorkspaceId={workspace.id} />
}
