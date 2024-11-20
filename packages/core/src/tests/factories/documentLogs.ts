import { ContentType, createChain } from '@latitude-data/compiler'
import { v4 as uuid } from 'uuid'

import {
  Commit,
  DocumentVersion,
  LogSources,
  ProviderLog,
  Workspace,
} from '../../browser'
import { findWorkspaceFromCommit } from '../../data-access'
import { hashContent } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { Config } from '../../services/ai'
import { createDocumentLog as ogCreateDocumentLog } from '../../services/documentLogs'
import { createProviderLog } from '../../services/providerLogs'
import { helpers } from './helpers'

export type IDocumentLogData = {
  document: DocumentVersion
  commit: Commit
  parameters?: Record<string, unknown>
  customIdentifier?: string
  createdAt?: Date
  skipProviderLogs?: boolean
}

async function generateProviderLogs({
  workspace,
  parameters,
  documentContent,
  documentLogUuid,
}: {
  workspace: Workspace
  parameters?: Record<string, unknown>
  documentContent: string
  documentLogUuid: string
}) {
  const providerLogs: ProviderLog[] = []
  const chain = createChain({
    prompt: documentContent,
    parameters: parameters ?? {},
  })
  let mockedResponse = undefined
  const providerScope = new ProviderApiKeysRepository(workspace.id)

  while (true) {
    const { completed, conversation } = await chain.step(mockedResponse)

    const config = conversation.config as Config
    const provider = await providerScope
      .findByName(config.provider!)
      .then((r) => r.unwrap())

    mockedResponse = helpers.randomSentence()
    const promptTokens = conversation.messages.reduce((acc, message) => {
      let content = message.content
      if (Array.isArray(content)) {
        content = content
          .map((c) => (c.type === ContentType.text ? c.text : ''))
          .join('')
      }
      return acc + content.length
    }, 0)
    const completionTokens = mockedResponse.length
    const log = await createProviderLog({
      workspace,
      uuid: uuid(),
      generatedAt: new Date(),
      documentLogUuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: config.model!,
      config: config,
      messages: conversation.messages,
      responseText: mockedResponse,
      toolCalls: [],
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
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
  createdAt,
  skipProviderLogs,
}: IDocumentLogData) {
  const workspace = (await findWorkspaceFromCommit(commit))!
  const documentLogUuid = uuid()
  let providerLogs: ProviderLog[] = []

  if (!skipProviderLogs) {
    providerLogs = await generateProviderLogs({
      workspace,
      parameters,
      documentContent: document.content,
      documentLogUuid,
    })
  }

  const duration =
    Math.floor(Math.random() * 100) +
    providerLogs.reduce((acc, log) => acc + (log?.duration ?? 0), 0)

  const documentLog = await ogCreateDocumentLog({
    commit,
    data: {
      uuid: documentLogUuid,
      documentUuid: document.documentUuid,
      originalPrompt: document.content,
      contentHash: document.contentHash ?? hashContent(document.content),
      parameters: parameters ?? {},
      customIdentifier,
      source: LogSources.API,
      duration,
      createdAt,
    },
  }).then((r) => r.unwrap())

  return {
    providerLogs,
    documentLog,
  }
}
