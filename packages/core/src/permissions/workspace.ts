import { UnauthorizedError } from '@latitude-data/constants/errors'

export const WorkspaceRoles = ['admin', 'annotator'] as const

export type WorkspaceRole = (typeof WorkspaceRoles)[number]

export const WorkspacePermissions = {
  ManageWorkspace: 'workspace.manage',
  ManageMembers: 'workspace.members.manage',
  AccessAnnotations: 'annotations.access',
  WriteAnnotations: 'annotations.write',
} as const

export type WorkspacePermission =
  (typeof WorkspacePermissions)[keyof typeof WorkspacePermissions]

type PermissionCheck = {
  role: WorkspaceRole
  permission: WorkspacePermission
  permissions?: WorkspacePermission[]
}

const rolePermissionsMap: Record<WorkspaceRole, WorkspacePermission[]> = {
  admin: Object.values(WorkspacePermissions),
  annotator: [
    WorkspacePermissions.AccessAnnotations,
    WorkspacePermissions.WriteAnnotations,
  ],
}

export function workspacePermissionsForRole(role: WorkspaceRole) {
  return rolePermissionsMap[role] ?? []
}

export function hasWorkspacePermission({
  role,
  permission,
  permissions,
}: PermissionCheck) {
  const rolePermissions = permissions ?? workspacePermissionsForRole(role)
  return rolePermissions.includes(permission)
}

export function assertWorkspacePermission(check: PermissionCheck) {
  if (hasWorkspacePermission(check)) return

  throw new UnauthorizedError('Unauthorized')
}
