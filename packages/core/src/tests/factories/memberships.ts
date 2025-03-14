import { Workspace, User } from '../../browser'
import { createMembership as createMembershipFn } from '../../services/memberships/create'
export async function createMembership({
  user,
  workspace,
  author,
}: {
  user: User
  workspace: Workspace
  author: User
}) {
  const result = await createMembershipFn({
    user,
    workspace,
    author,
  })
  return result.unwrap()
}
