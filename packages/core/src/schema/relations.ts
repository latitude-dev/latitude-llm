import { relations } from 'drizzle-orm'

import { apiKeys } from './models/apiKeys'
import { commits } from './models/commits'
import { connectedEvaluations } from './models/connectedEvaluations'
import { documentLogs } from './models/documentLogs'
import { documentVersions } from './models/documentVersions'
import { evaluationResults } from './models/evaluationResults'
import { evaluations } from './models/evaluations'
import { memberships } from './models/memberships'
import { projects } from './models/projects'
import { providerApiKeys } from './models/providerApiKeys'
import { providerLogs } from './models/providerLogs'
import { sessions } from './models/sessions'
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
}))

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
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
