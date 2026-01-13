import { getDataFromSession } from '$/data-access'
import {
  WorkspacePermission,
  WorkspacePermissions,
  assertWorkspacePermission,
} from '@latitude-data/core/permissions/workspace'
import { NextRequest, NextResponse } from 'next/server'

export function authHandler(
  handler: any,
  permission: WorkspacePermission = WorkspacePermissions.ManageWorkspace,
) {
  return async (
    req: NextRequest,
    {
      params,
      ...rest
    }: {
      params: Promise<Record<string, string>>
    },
  ) => {
    const { user, workspace, membership, workspacePermissions } =
      await getDataFromSession()
    if (!user || !workspace || !membership) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    try {
      assertWorkspacePermission({
        role: membership.role,
        permissions: workspacePermissions,
        permission,
      })
    } catch {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    return await handler(req, {
      ...rest,
      params: await params,
      user,
      workspace,
      membership,
      workspacePermissions,
    })
  }
}
