export {
  scope,
  unsafeScope,
  findAll,
  findById,
  findMany,
  findFirst,
} from './scope'
export type { Scope, UnsafeScope, QueryOptions } from './scope'

export { projectsScope } from './projects/scope'
export type { ProjectsScope } from './projects/scope'
export { findProjectById } from './projects/findById'
export { findProjectByName } from './projects/findByName'
export { findProjectByDocumentUuid } from './projects/findByDocumentUuid'
export { findFirstProject } from './projects/findFirst'
export { findAllActiveProjects } from './projects/findAllActive'

export { workspaceUsersScope, usersScope } from './users/scope'
export type { WorkspaceUsersScope, UsersScope } from './users/scope'
export { unsafelyFindUserById } from './users/findById'
export {
  unsafelyFindUserByEmail,
  unsafelyFindUserIdByEmail,
} from './users/findByEmail'
export { findFirstUserInWorkspace } from './users/findFirstInWorkspace'
export { lockUser } from './users/lock'
