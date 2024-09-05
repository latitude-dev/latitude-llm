import { ToolCall } from '@latitude-data/compiler'
import { type InferSelectModel } from 'drizzle-orm'

import { apiKeys } from './models/apiKeys'
import { commits } from './models/commits'
import { connectedEvaluations } from './models/connectedEvaluations'
import { datasets } from './models/datasets'
import { documentLogs } from './models/documentLogs'
import { documentVersions } from './models/documentVersions'
import { evaluationResults } from './models/evaluationResults'
import { evaluations } from './models/evaluations'
import { evaluationTemplateCategories } from './models/evaluationTemplateCategories'
import { evaluationTemplates } from './models/evaluationTemplates'
import { llmAsJudgeEvaluationMetadatas } from './models/llmAsJudgeEvaluationMetadatas'
import { magicLinkTokens } from './models/magicLinkTokens'
import { memberships } from './models/memberships'
import { projects } from './models/projects'
import { providerApiKeys } from './models/providerApiKeys'
import { providerLogs } from './models/providerLogs'
import { sessions } from './models/sessions'
import { users } from './models/users'
import { workspaces } from './models/workspaces'

// Model types are out of schema files to be able to share with NextJS webpack bundler
// otherwise, it will throw an error.
export type Workspace = InferSelectModel<typeof workspaces>
export type User = InferSelectModel<typeof users>
// TODO: remove SafeUser and SafeWorkspace
export type SafeUser = User
export type SafeWorkspace = { id: number; name: string }
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
export type MagicLinkToken = InferSelectModel<typeof magicLinkTokens>
export type EvaluationTemplateCategory = InferSelectModel<
  typeof evaluationTemplateCategories
>
export type LlmAsJudgeEvaluationMetadata = InferSelectModel<
  typeof llmAsJudgeEvaluationMetadatas
>

export type { EvaluationTemplateWithCategory } from '../data-access/evaluationTemplates'

export type EvaluationDto = Evaluation & {
  metadata: Omit<
    LlmAsJudgeEvaluationMetadata,
    'metadataType' | 'createdAt' | 'updatedAt'
  >
}

export type Dataset = InferSelectModel<typeof datasets> & {
  author: Pick<User, 'id' | 'name'> | undefined
}
