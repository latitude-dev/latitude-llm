import { ToolCall } from '@latitude-data/compiler'
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

import { connectedEvaluations } from './models/connectedEvaluations'
import { documentLogs } from './models/documentLogs'
import { evaluationResults } from './models/evaluationResults'
import { evaluations } from './models/evaluations'
import { evaluationTemplates } from './models/evaluationTemplates'
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
export type ProviderLog = InferSelectModel<typeof providerLogs> & {
  // Typescript thinks these 2 are optional because they are in the schema
  // but we add a default empty string and empty array to them
  responseText: string
  toolCalls: ToolCall[]
}
export type DocumentLog = InferSelectModel<typeof documentLogs>
export type Evaluation = InferSelectModel<typeof evaluations>
export type ConnectedEvaluation = InferSelectModel<typeof connectedEvaluations>
export type EvaluationResult = InferSelectModel<typeof evaluationResults>
export type EvaluationTemplate = InferSelectModel<typeof evaluationTemplates>
