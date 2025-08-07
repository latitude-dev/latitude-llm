import { relations } from 'drizzle-orm'

import { connectedEvaluations } from './legacyModels/connectedEvaluations'
import { evaluationAdvancedTemplates } from './legacyModels/evaluationAdvancedTemplates'
import { evaluationConfigurationBoolean } from './legacyModels/evaluationConfigurationBoolean'
import { evaluationConfigurationNumerical } from './legacyModels/evaluationConfigurationNumerical'
import { evaluationConfigurationText } from './legacyModels/evaluationConfigurationText'
import { evaluationMetadataLlmAsJudgeAdvanced } from './legacyModels/evaluationMetadataLlmAsJudgeAdvanced'
import { evaluationMetadataLlmAsJudgeSimple } from './legacyModels/evaluationMetadataLlmAsJudgeSimple'
import { evaluationResults } from './legacyModels/evaluationResults'
import { evaluations } from './legacyModels/evaluations'
import { apiKeys } from './models/apiKeys'
import { commits } from './models/commits'
import { datasets } from './models/datasets'
import { documentLogs } from './models/documentLogs'
import { documentVersions } from './models/documentVersions'
import { events } from './models/events'
import { integrations } from './models/integrations'
import { magicLinkTokens } from './models/magicLinkTokens'
import { mcpServers } from './models/mcpServers'
import { memberships } from './models/memberships'
import { projects } from './models/projects'
import { providerApiKeys } from './models/providerApiKeys'
import { providerLogs } from './models/providerLogs'
import { sessions } from './models/sessions'
import { subscriptions } from './models/subscriptions'
import { users } from './models/users'
import { workspaces } from './models/workspaces'

/**
 * NOTE: All relations are declared in this file to
 * avoid circular dependencies between models.
 * ::::::::::::::::::::::::::::::::::::::::::::::::
 */

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(memberships),
  magicLinkTokens: many(magicLinkTokens),
}))

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
  author: one(users, {
    fields: [workspaces.creatorId],
    references: [users.id],
  }),
  memberships: many(memberships),
  events: many(events),
  currentSubscription: one(subscriptions, {
    fields: [workspaces.currentSubscriptionId],
    references: [subscriptions.id],
  }),
  subscriptions: many(subscriptions),
  defaultProvider: one(providerApiKeys, {
    fields: [workspaces.defaultProviderId],
    references: [providerApiKeys.id],
  }),
  integrations: many(integrations),
}))

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id],
  }),
}))

export const projectRelations = relations(projects, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
}))

export const commitRelations = relations(commits, ({ one }) => ({
  project: one(projects, {
    fields: [commits.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [commits.userId],
    references: [users.id],
  }),
}))

export const connectedEvaluationRelations = relations(
  connectedEvaluations,
  ({ one }) => ({
    document: one(documentVersions, {
      fields: [connectedEvaluations.documentUuid],
      references: [documentVersions.documentUuid],
    }),
    evaluation: one(evaluations, {
      fields: [connectedEvaluations.evaluationId],
      references: [evaluations.id],
    }),
  }),
)

export const documentLogsRelations = relations(documentLogs, ({ one }) => ({
  commit: one(commits, {
    fields: [documentLogs.commitId],
    references: [commits.id],
  }),
}))

export const documentVersionRelations = relations(
  documentVersions,
  ({ one }) => ({
    commit: one(commits, {
      fields: [documentVersions.commitId],
      references: [commits.id],
    }),
  }),
)

export const evaluationResultRelations = relations(
  evaluationResults,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationResults.evaluationId],
      references: [evaluations.id],
    }),
    documentLog: one(documentLogs, {
      fields: [evaluationResults.documentLogId],
      references: [documentLogs.id],
    }),
    providerLog: one(providerLogs, {
      fields: [evaluationResults.providerLogId],
      references: [providerLogs.id],
    }),
  }),
)

export const evaluationRelations = relations(evaluations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [evaluations.workspaceId],
    references: [workspaces.id],
  }),
}))

export const EvaluationMetadatallmAsJudgeAdvancedRelations = relations(
  evaluationMetadataLlmAsJudgeAdvanced,
  ({ one }) => ({
    template: one(evaluationAdvancedTemplates, {
      fields: [evaluationMetadataLlmAsJudgeAdvanced.templateId],
      references: [evaluationAdvancedTemplates.id],
    }),
    evaluation: one(evaluations, {
      fields: [evaluationMetadataLlmAsJudgeAdvanced.id],
      references: [evaluations.metadataId],
    }),
  }),
)

export const EvaluationMetadatallmAsJudgeSimpleRelations = relations(
  evaluationMetadataLlmAsJudgeSimple,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationMetadataLlmAsJudgeSimple.id],
      references: [evaluations.metadataId],
    }),
  }),
)

export const EvaluationConfigurationBooleanRelations = relations(
  evaluationConfigurationBoolean,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationConfigurationBoolean.id],
      references: [evaluations.resultConfigurationId],
    }),
  }),
)

export const EvaluationConfigurationNumericalRelations = relations(
  evaluationConfigurationNumerical,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationConfigurationNumerical.id],
      references: [evaluations.resultConfigurationId],
    }),
  }),
)

export const EvaluationConfigurationTextRelations = relations(
  evaluationConfigurationText,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationConfigurationText.id],
      references: [evaluations.resultConfigurationId],
    }),
  }),
)

export const membershipRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}))

export const providerApiKeysRelations = relations(
  providerApiKeys,
  ({ one }) => ({
    author: one(users, {
      fields: [providerApiKeys.authorId],
      references: [users.id],
    }),
    workspace: one(workspaces, {
      fields: [providerApiKeys.workspaceId],
      references: [workspaces.id],
    }),
  }),
)

export const providerLogsRelations = relations(providerLogs, ({ one }) => ({
  provider: one(providerApiKeys, {
    fields: [providerLogs.providerId],
    references: [providerApiKeys.id],
  }),
  apiKey: one(apiKeys, {
    fields: [providerLogs.apiKeyId],
    references: [apiKeys.id],
  }),
}))

export const magicLinkTokensRelations = relations(
  magicLinkTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [magicLinkTokens.userId],
      references: [users.id],
    }),
  }),
)

export const datasetsRelations = relations(datasets, ({ one }) => ({
  author: one(users, {
    fields: [datasets.authorId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [datasets.workspaceId],
    references: [workspaces.id],
  }),
}))

export const eventRelations = relations(events, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [events.workspaceId],
    references: [workspaces.id],
  }),
}))

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscriptions.workspaceId],
    references: [workspaces.id],
  }),
}))

export const integrationsRelations = relations(integrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [integrations.workspaceId],
    references: [workspaces.id],
  }),
  author: one(users, {
    fields: [integrations.authorId],
    references: [users.id],
  }),
  mcpServer: one(mcpServers, {
    fields: [integrations.mcpServerId],
    references: [mcpServers.id],
  }),
}))
