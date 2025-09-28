// Combined schema for Drizzle
import { users } from './models/users'
import { workspaces } from './models/workspaces'
import { apiKeys } from './models/apiKeys'
import { providerApiKeys } from './models/providerApiKeys'
import { providerLogs } from './models/providerLogs'
import { projects } from './models/projects'
import { documentVersions } from './models/documentVersions'
import { documentLogs } from './models/documentLogs'
import { documentSuggestions } from './models/documentSuggestions'
import { documentTriggers } from './models/documentTriggers'
import { documentTriggerEvents } from './models/documentTriggerEvents'
import { publishedDocuments } from './models/publishedDocuments'
import { commits } from './models/commits'
import { datasets } from './models/datasets'
import { datasetRows } from './models/datasetRows'
import { evaluationVersions } from './models/evaluationVersions'
import { evaluationResultsV2 } from './models/evaluationResultsV2'
import { experiments } from './models/experiments'
import { runErrors } from './models/runErrors'
import { spans } from './models/spans'
import { events } from './models/events'
import { webhooks, webhookDeliveries } from './models/webhooks'
import { integrations } from './models/integrations'
import { mcpServers } from './models/mcpServers'
import { memberships } from './models/memberships'
import { oauthAccounts } from './models/oauthAccounts'
import { sessions } from './models/sessions'
import { subscriptions } from './models/subscriptions'
import { features } from './models/features'
import { workspaceFeatures } from './models/workspaceFeatures'
import { workspaceOnboarding } from './models/workspaceOnboarding'
import { promocodes } from './models/promocodes'
import { claimedPromocodes } from './models/claimedPromocodes'
import { claimedRewards } from './models/claimedRewards'
import { magicLinkTokens } from './models/magicLinkTokens'
import { latteRequests } from './models/latteRequests'
import { latteThreads } from './models/latteThreads'
import { latteThreadCheckpoints } from './models/latteThreadCheckpoints'
import { latitudeExports } from './models/exports'
import { grants } from './models/grants'

// Legacy models
import { connectedEvaluations } from './legacyModels/connectedEvaluations'
import { datasetsV1 } from './legacyModels/datasetsV1'
import { evaluationAdvancedTemplates } from './legacyModels/evaluationAdvancedTemplates'
import { evaluationConfigurationBoolean } from './legacyModels/evaluationConfigurationBoolean'
import { evaluationConfigurationNumerical } from './legacyModels/evaluationConfigurationNumerical'
import { evaluationConfigurationText } from './legacyModels/evaluationConfigurationText'
import { evaluationMetadataManual } from './legacyModels/evaluationMetadataDefault'
import { evaluationMetadataLlmAsJudgeAdvanced } from './legacyModels/evaluationMetadataLlmAsJudgeAdvanced'
import { evaluationMetadataLlmAsJudgeSimple } from './legacyModels/evaluationMetadataLlmAsJudgeSimple'
import { evaluationResultableBooleans } from './legacyModels/evaluationResultableBooleans'
import { evaluationResultableNumbers } from './legacyModels/evaluationResultableNumbers'
import { evaluationResultableTexts } from './legacyModels/evaluationResultableTexts'
import { evaluationResults } from './legacyModels/evaluationResults'
import { evaluationTemplateCategories } from './legacyModels/evaluationTemplateCategories'
import { evaluations } from './legacyModels/evaluations'

export const schema = {
  users,
  workspaces,
  apiKeys,
  providerApiKeys,
  providerLogs,
  projects,
  documentVersions,
  documentLogs,
  documentSuggestions,
  documentTriggers,
  documentTriggerEvents,
  publishedDocuments,
  commits,
  datasets,
  datasetRows,
  evaluationVersions,
  evaluationResultsV2,
  experiments,
  runErrors,
  spans,
  events,
  webhooks,
  webhookDeliveries,
  integrations,
  mcpServers,
  memberships,
  oauthAccounts,
  sessions,
  subscriptions,
  features,
  workspaceFeatures,
  workspaceOnboarding,
  promocodes,
  claimedPromocodes,
  claimedRewards,
  magicLinkTokens,
  latteRequests,
  latteThreads,
  latteThreadCheckpoints,
  latitudeExports,
  grants,

  // Legacy
  connectedEvaluations,
  datasetsV1,
  evaluationAdvancedTemplates,
  evaluationConfigurationBoolean,
  evaluationConfigurationNumerical,
  evaluationConfigurationText,
  evaluationMetadataManual,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluationResultableBooleans,
  evaluationResultableNumbers,
  evaluationResultableTexts,
  evaluationResults,
  evaluationTemplateCategories,
  evaluations,
}
