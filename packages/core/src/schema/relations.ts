import { relations } from 'drizzle-orm'

import {
  annotationQueueMembers,
  annotationQueues,
} from './models/annotationQueues'
import { apiKeys } from './models/apiKeys'
import { commits } from './models/commits'
import { datasets } from './models/datasets'
import { documentVersions } from './models/documentVersions'
import { events } from './models/events'
import { integrationHeaderPresets } from './models/integrationHeaderPresets'
import { integrations } from './models/integrations'
import { magicLinkTokens } from './models/magicLinkTokens'
import { mcpOAuthCredentials } from './models/mcpOAuthCredentials'
import { mcpServers } from './models/mcpServers'
import { memberships } from './models/memberships'
import { projects } from './models/projects'
import { providerApiKeys } from './models/providerApiKeys'
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

export const documentVersionRelations = relations(
  documentVersions,
  ({ one }) => ({
    commit: one(commits, {
      fields: [documentVersions.commitId],
      references: [commits.id],
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
  oauthCredentials: one(mcpOAuthCredentials, {
    fields: [integrations.id],
    references: [mcpOAuthCredentials.integrationId],
  }),
}))

export const mcpOAuthCredentialsRelations = relations(
  mcpOAuthCredentials,
  ({ one }) => ({
    integration: one(integrations, {
      fields: [mcpOAuthCredentials.integrationId],
      references: [integrations.id],
    }),
  }),
)

export const integrationHeaderPresetsRelations = relations(
  integrationHeaderPresets,
  ({ one }) => ({
    integration: one(integrations, {
      fields: [integrationHeaderPresets.integrationId],
      references: [integrations.id],
    }),
    workspace: one(workspaces, {
      fields: [integrationHeaderPresets.workspaceId],
      references: [workspaces.id],
    }),
    author: one(users, {
      fields: [integrationHeaderPresets.authorId],
      references: [users.id],
    }),
  }),
)

export const annotationQueuesRelations = relations(
  annotationQueues,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [annotationQueues.workspaceId],
      references: [workspaces.id],
    }),
    project: one(projects, {
      fields: [annotationQueues.projectId],
      references: [projects.id],
    }),
    members: many(annotationQueueMembers),
  }),
)

export const annotationQueueMembersRelations = relations(
  annotationQueueMembers,
  ({ one }) => ({
    annotationQueue: one(annotationQueues, {
      fields: [annotationQueueMembers.annotationQueueId],
      references: [annotationQueues.id],
    }),
    membership: one(memberships, {
      fields: [annotationQueueMembers.membershipId],
      references: [memberships.id],
    }),
  }),
)
