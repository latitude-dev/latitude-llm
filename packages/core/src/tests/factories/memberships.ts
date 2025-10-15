import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
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
