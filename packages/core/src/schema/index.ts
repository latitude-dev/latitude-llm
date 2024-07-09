export { latitudeSchema } from './db-schema'
export { promptVersions } from './models/promptVersions'
export { promptSnapshots } from './models/promptSnapshots'
export { commits } from './models/commits'
export { convos, convoRelations, type Convo } from './models/convos'
export { users, type User } from './models/users'
export { accounts, type Account } from './models/accounts'
export { sessions, type Session } from './models/sessions'
export { workspaces, type Workspace } from './models/workspaces'
export { apiKeys, type ApiKey } from './models/apiKeys'

// NOTE: This files exist to avoid circular dependencies between type
// declarations and relations of some of our models.
export * from './models/types'
export * from './models/relations'
