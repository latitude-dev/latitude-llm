#!/usr/bin/env tsx

import { and, eq, isNull } from 'drizzle-orm'
import { Providers } from '@latitude-data/constants'
import { database } from '../src/client'
import { SubscriptionPlan } from '../src/plans'
import { apiKeys } from '../src/schema/models/apiKeys'
import { memberships } from '../src/schema/models/memberships'
import { providerApiKeys } from '../src/schema/models/providerApiKeys'
import { subscriptions } from '../src/schema/models/subscriptions'
import { users } from '../src/schema/models/users'
import { workspaces } from '../src/schema/models/workspaces'

const workspaceName =
  process.env.ACCEPTANCE_WORKSPACE_NAME ?? 'Acceptance Workspace'
const userEmail =
  process.env.ACCEPTANCE_USER_EMAIL ?? 'acceptance@latitude.local'
const userName = process.env.ACCEPTANCE_USER_NAME ?? 'Acceptance User'
const apiKeyToken = process.env.TEST_LATITUDE_API_KEY
const providerToken =
  process.env.ACCEPTANCE_PROVIDER_API_KEY ??
  process.env.DEFAULT_PROVIDER_API_KEY
const providerName = process.env.ACCEPTANCE_PROVIDER_NAME ?? Providers.OpenAI
const defaultModel = process.env.ACCEPTANCE_DEFAULT_MODEL ?? 'gpt-4.1-mini'
const subscriptionPlan =
  (process.env.ACCEPTANCE_SUBSCRIPTION_PLAN as SubscriptionPlan) ??
  SubscriptionPlan.HobbyV3

async function main() {
  if (!apiKeyToken) {
    throw new Error('TEST_LATITUDE_API_KEY is required')
  }

  if (!providerToken) {
    throw new Error(
      'ACCEPTANCE_PROVIDER_API_KEY or DEFAULT_PROVIDER_API_KEY is required',
    )
  }

  const now = new Date()

  const existingUser = await database
    .select()
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1)
    .then((rows) => rows[0])

  const user =
    existingUser ??
    (await database
      .insert(users)
      .values({
        email: userEmail,
        name: userName,
        confirmedAt: now,
      })
      .returning()
      .then((rows) => rows[0]!))

  const existingWorkspace = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, workspaceName))
    .limit(1)
    .then((rows) => rows[0])

  const workspace =
    existingWorkspace ??
    (await database
      .insert(workspaces)
      .values({
        name: workspaceName,
        creatorId: user.id,
      })
      .returning()
      .then((rows) => rows[0]!))

  let subscription = await database
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspace.id))
    .limit(1)
    .then((rows) => rows[0])

  if (!subscription) {
    subscription = await database
      .insert(subscriptions)
      .values({
        workspaceId: workspace.id,
        plan: subscriptionPlan,
      })
      .returning()
      .then((rows) => rows[0]!)
  }

  if (!workspace.currentSubscriptionId) {
    await database
      .update(workspaces)
      .set({ currentSubscriptionId: subscription.id })
      .where(eq(workspaces.id, workspace.id))
  }

  const existingMembership = await database
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspace.id),
        eq(memberships.userId, user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!existingMembership) {
    await database.insert(memberships).values({
      workspaceId: workspace.id,
      userId: user.id,
      confirmedAt: now,
    })
  }

  const existingApiKey = await database
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.token, apiKeyToken))
    .limit(1)
    .then((rows) => rows[0])

  if (existingApiKey && existingApiKey.workspaceId !== workspace.id) {
    throw new Error(
      `TEST_LATITUDE_API_KEY is already used by workspace ${existingApiKey.workspaceId}`,
    )
  }

  if (!existingApiKey) {
    await database.insert(apiKeys).values({
      token: apiKeyToken,
      workspaceId: workspace.id,
      name: 'Acceptance',
    })
  }

  let providerApiKey = await database
    .select()
    .from(providerApiKeys)
    .where(
      and(
        eq(providerApiKeys.workspaceId, workspace.id),
        eq(providerApiKeys.name, providerName),
        isNull(providerApiKeys.deletedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!providerApiKey) {
    providerApiKey = await database
      .insert(providerApiKeys)
      .values({
        name: providerName,
        token: providerToken,
        provider: Providers.OpenAI,
        authorId: user.id,
        workspaceId: workspace.id,
        defaultModel,
      })
      .returning()
      .then((rows) => rows[0]!)
  } else if (providerApiKey.token !== providerToken) {
    await database
      .update(providerApiKeys)
      .set({ token: providerToken, defaultModel })
      .where(eq(providerApiKeys.id, providerApiKey.id))
  }

  if (!workspace.defaultProviderId) {
    await database
      .update(workspaces)
      .set({ defaultProviderId: providerApiKey.id })
      .where(eq(workspaces.id, workspace.id))
  }

  console.log('Acceptance seed complete')
  console.log(`Workspace: ${workspace.name} (${workspace.id})`)
  console.log(`User: ${user.email} (${user.id})`)
  console.log(`Provider: ${providerName} (${providerApiKey.id})`)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Seed failed: ${message}`)
    process.exit(1)
  })
