import { beforeEach, describe, expect, it } from 'vitest'

import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { LogSources, Providers } from '@latitude-data/constants'
import { database } from '../../client'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import Transaction from '../../lib/Transaction'
import { events } from '../../schema/models/events'
import { spans } from '../../schema/models/spans'
import { documentLogs } from '../../schema/legacyModels/documentLogs'
import { evaluationResults } from '../../schema/legacyModels/evaluationResults'
import {
  EvaluationMetadataType,
  evaluations,
} from '../../schema/legacyModels/evaluations'
import { providerLogs } from '../../schema/legacyModels/providerLogs'
import { type Commit } from '../../schema/models/types/Commit'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import {
  createApiKey,
  createProject,
  createProviderApiKey,
  createSpan,
} from '../../tests/factories'
import { destroyWorkspace } from './destroy'

describe('destroyWorkspace', () => {
  let workspace: Workspace
  let user: User
  let commit: Commit

  beforeEach(async () => {
    const {
      workspace: w,
      user: u,
      commit: c,
    } = await createProject({ workspace: { name: 'workspace' } })
    workspace = w
    user = u
    commit = c
  })

  it('destroys an empty workspace', async () => {
    const result = await destroyWorkspace(workspace)

    expect(result.ok).toBe(true)
    expect(await unsafelyFindWorkspace(workspace.id)).toBeUndefined()
  })

  it('destroys a workspace with spans, provider logs and legacy evaluation results', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'provider',
      type: Providers.OpenAI,
    })
    const { apiKey } = await createApiKey({
      workspace,
      name: faker.string.alpha(),
    })

    // events.workspaceId -> workspaces.id has no onDelete (NO ACTION) and is
    // not removed by cascade, so it blocks deleting the workspace row.
    await database.insert(events).values({
      workspaceId: workspace.id,
      type: 'workspaceCreated',
      data: {},
    })

    // spans.apiKeyId -> apiKeys.id is onDelete: 'restrict'
    await createSpan({ workspaceId: workspace.id, apiKeyId: apiKey.id })

    // provider_logs.providerId -> providerApiKeys.id and
    // provider_logs.apiKeyId -> apiKeys.id are both onDelete: 'restrict'
    const [providerLog] = await database
      .insert(providerLogs)
      .values({
        uuid: faker.string.uuid(),
        workspaceId: workspace.id,
        providerId: provider.id,
        apiKeyId: apiKey.id,
        source: LogSources.API,
      })
      .returning()

    // Legacy v1 chain: evaluation_results.providerLogId -> provider_logs.id has
    // no onDelete (NO ACTION). evaluation_results has no workspaceId, so it is
    // only reachable through evaluations and blocks deleting the provider log.
    const [evaluation] = await database
      .insert(evaluations)
      .values({
        workspaceId: workspace.id,
        name: 'evaluation',
        description: 'legacy evaluation',
        metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
        metadataId: 1,
      })
      .returning()

    const [documentLog] = await database
      .insert(documentLogs)
      .values({
        uuid: faker.string.uuid(),
        workspaceId: workspace.id,
        documentUuid: faker.string.uuid(),
        commitId: commit.id,
        resolvedContent: 'content',
        contentHash: 'hash',
        parameters: {},
        source: LogSources.API,
      })
      .returning()

    await database.insert(evaluationResults).values({
      uuid: faker.string.uuid(),
      evaluationId: evaluation!.id,
      documentLogId: documentLog!.id,
      providerLogId: providerLog!.id,
      evaluatedProviderLogId: providerLog!.id,
      evaluationProviderLogId: providerLog!.id,
      source: LogSources.API,
    })

    const result = await destroyWorkspace(workspace)

    expect(result.ok).toBe(true)
    expect(await unsafelyFindWorkspace(workspace.id)).toBeUndefined()
  })

  it('destroys a workspace whose data exceeds a single delete batch', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'provider',
      type: Providers.OpenAI,
    })
    const { apiKey } = await createApiKey({
      workspace,
      name: faker.string.alpha(),
    })

    for (let i = 0; i < 5; i++) {
      await createSpan({ workspaceId: workspace.id, apiKeyId: apiKey.id })

      await database.insert(providerLogs).values({
        uuid: faker.string.uuid(),
        workspaceId: workspace.id,
        providerId: provider.id,
        apiKeyId: apiKey.id,
        source: LogSources.API,
      })

      await database.insert(documentLogs).values({
        uuid: faker.string.uuid(),
        workspaceId: workspace.id,
        documentUuid: faker.string.uuid(),
        commitId: commit.id,
        resolvedContent: 'content',
        contentHash: 'hash',
        parameters: {},
        source: LogSources.API,
      })

      await database.insert(events).values({
        workspaceId: workspace.id,
        type: 'workspaceCreated',
        data: {},
      })
    }

    const result = await destroyWorkspace(workspace, new Transaction(), 2)

    expect(result.ok).toBe(true)
    expect(await unsafelyFindWorkspace(workspace.id)).toBeUndefined()
    expect(
      await database
        .select()
        .from(spans)
        .where(eq(spans.workspaceId, workspace.id)),
    ).toHaveLength(0)
    expect(
      await database
        .select()
        .from(providerLogs)
        .where(eq(providerLogs.workspaceId, workspace.id)),
    ).toHaveLength(0)
  })

  it('destroys a workspace with legacy logs missing workspace_id', async () => {
    const provider = await createProviderApiKey({
      workspace,
      user,
      name: 'provider',
      type: Providers.OpenAI,
    })
    const { apiKey } = await createApiKey({
      workspace,
      name: faker.string.alpha(),
    })

    // Legacy provider_logs rows predate the workspace_id column, but still
    // block deleting the workspace's provider/API keys (onDelete: 'restrict').
    // They are only reachable through their provider.
    const [orphanProviderLog] = await database
      .insert(providerLogs)
      .values({
        uuid: faker.string.uuid(),
        workspaceId: null,
        providerId: provider.id,
        apiKeyId: apiKey.id,
        source: LogSources.API,
      })
      .returning()

    // Legacy document_logs rows predate the workspace_id column, but still
    // block the workspace cascade through commits (onDelete: 'restrict').
    // They are only reachable through their commit.
    const [orphanDocumentLog] = await database
      .insert(documentLogs)
      .values({
        uuid: faker.string.uuid(),
        workspaceId: null,
        documentUuid: faker.string.uuid(),
        commitId: commit.id,
        resolvedContent: 'content',
        contentHash: 'hash',
        parameters: {},
        source: LogSources.API,
      })
      .returning()

    const result = await destroyWorkspace(workspace)

    expect(result.ok).toBe(true)
    expect(await unsafelyFindWorkspace(workspace.id)).toBeUndefined()
    expect(
      await database
        .select()
        .from(providerLogs)
        .where(eq(providerLogs.id, orphanProviderLog!.id)),
    ).toHaveLength(0)
    expect(
      await database
        .select()
        .from(documentLogs)
        .where(eq(documentLogs.id, orphanDocumentLog!.id)),
    ).toHaveLength(0)
  })
})
