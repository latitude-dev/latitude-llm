import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { type Workspace } from '../../schema/models/types/Workspace'
import { LogSources } from '../../constants'
import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { ProviderApiKeysRepository } from '../../repositories'
import { documentLogs } from '../../schema/models/documentLogs'
import { createDocumentLog as ogCreateDocumentLog } from '../../services/documentLogs/create'
import { getResolvedContent } from '../../services/documents'
import { createProviderLog } from '../../services/providerLogs/create'
import { helpers } from './helpers'
import { createChain } from 'promptl-ai'
import { PartialConfig } from '../../services/ai'
import { Message } from '@latitude-data/constants/messages'

export type IDocumentLogData = {
  document: DocumentVersion
  commit: Commit
  parameters?: Record<string, unknown>
  customIdentifier?: string
  source?: LogSources
  experimentId?: number
  totalDuration?: number
  createdAt?: Date
  automaticProvidersGeneratedAt?: Date
  skipProviderLogs?: boolean
}

async function generateProviderLogs({
  workspace,
  parameters,
  documentContent,
  documentLogUuid,
  generatedAt,
}: {
  workspace: Workspace
  parameters?: Record<string, unknown>
  documentContent: string
  documentLogUuid: string
  generatedAt?: Date
}) {
  const providerLogs: ProviderLog[] = []
  const chain = createChain({
    prompt: documentContent,
    parameters: parameters ?? {},
  })
  let mockedResponse = undefined
  const providerScope = new ProviderApiKeysRepository(workspace.id)

  while (true) {
    const { completed, config, messages } = await chain.step(mockedResponse)
    const provider = await providerScope
      .findByName(config.provider as string)
      .then((r) => r.unwrap())

    mockedResponse = helpers.randomSentence()
    const promptTokens = messages.reduce((acc, message) => {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .map((c) => (c.type === 'text' ? c.text : ''))
              .join('')
      return acc + content.length
    }, 0)
    const completionTokens = mockedResponse.length
    const log = await createProviderLog({
      workspace,
      uuid: uuid(),
      generatedAt: generatedAt ?? new Date(),
      documentLogUuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: config.model as string,
      config: config as PartialConfig,
      messages: messages as unknown as Message[],
      responseText: mockedResponse,
      toolCalls: [],
      usage: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      duration: Math.floor(Math.random() * 1000),
      source: LogSources.Playground,
    }).then((r) => r.unwrap())

    providerLogs.push(log)

    if (completed) break
  }

  return providerLogs
}

export async function createDocumentLog({
  document,
  commit,
  parameters,
  customIdentifier,
  source,
  experimentId,
  totalDuration,
  createdAt,
  skipProviderLogs,
  automaticProvidersGeneratedAt,
}: IDocumentLogData) {
  const workspace = await findWorkspaceFromCommit(commit)
  const documentContent = await getResolvedContent({
    document,
    commit,
  }).then((r) => r.unwrap())
  const documentLogUuid = uuid()

  let providerLogs: ProviderLog[] = []
  if (!skipProviderLogs) {
    providerLogs = await generateProviderLogs({
      workspace,
      parameters,
      documentContent,
      documentLogUuid,
      generatedAt: automaticProvidersGeneratedAt,
    })
  }

  const duration =
    totalDuration ??
    Math.floor(Math.random() * 100) +
      providerLogs.reduce((acc, log) => acc + (log?.duration ?? 0), 0)

  let documentLog = await ogCreateDocumentLog({
    commit,
    data: {
      uuid: documentLogUuid,
      documentUuid: document.documentUuid,
      resolvedContent: documentContent,
      parameters: parameters ?? {},
      customIdentifier,
      source: source ?? LogSources.API,
      experimentId,
      duration,
      createdAt,
    },
  }).then((r) => r.unwrap())

  if (!createdAt) {
    // Tests run within a transaction and the NOW() PostgreSQL function returns
    // the transaction start time. Therefore, all document logs would be created
    // at the same time, messing with tests. This code patches this.
    documentLog = (
      await database
        .update(documentLogs)
        .set({ createdAt: new Date() })
        .where(eq(documentLogs.id, documentLog.id))
        .returning()
    )[0]!
  }

  return {
    providerLogs,
    documentLog,
  }
}
