import { apiKeys } from '$core/schema/models/apiKeys'
import { commits } from '$core/schema/models/commits'
import { documentVersions } from '$core/schema/models/documentVersions'
import { memberships } from '$core/schema/models/memberships'
import { projects } from '$core/schema/models/projects'
import { providerApiKeys } from '$core/schema/models/providerApiKeys'
import { sessions } from '$core/schema/models/sessions'
import { users } from '$core/schema/models/users'
import { workspaces } from '$core/schema/models/workspaces'
import { type InferSelectModel } from 'drizzle-orm'

import { documentLogs } from './models/documentLogs'
import { providerLogs } from './models/providerLogs'

// Model types are out of schema files to be able to share with NextJS webpack bundler
// otherwise, it will throw an error.
export type Workspace = InferSelectModel<typeof workspaces>
export type User = InferSelectModel<typeof users>
export type SafeUser = Pick<User, 'id' | 'name' | 'email'>
export type Session = InferSelectModel<typeof sessions> & {
  user: User
}
export type Membership = InferSelectModel<typeof memberships>
export type ProviderApiKey = InferSelectModel<typeof providerApiKeys>
export type ApiKey = InferSelectModel<typeof apiKeys>
export type Commit = InferSelectModel<typeof commits>
export type DocumentVersion = InferSelectModel<typeof documentVersions>
export type Project = InferSelectModel<typeof projects>
export type ProviderLog = InferSelectModel<typeof providerLogs>
export type DocumentLog = InferSelectModel<typeof documentLogs>
