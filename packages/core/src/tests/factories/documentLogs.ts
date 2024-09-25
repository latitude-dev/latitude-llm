import { ContentType, createChain } from '@latitude-data/compiler'
import { v4 as uuid } from 'uuid'

import { Commit, DocumentVersion, LogSources, ProviderLog } from '../../browser'
import { findWorkspaceFromCommit } from '../../data-access'
import { ProviderApiKeysRepository } from '../../repositories'
import { Config } from '../../services/ai'
import { createDocumentLog as ogCreateDocumentLog } from '../../services/documentLogs'
import { getResolvedContent } from '../../services/documents'
import { createProviderLog } from '../../services/providerLogs'
import { helpers } from './helpers'

export type IDocumentLogData = {
  document: DocumentVersion
  commit: Commit
  parameters?: Record<string, unknown>
  customIdentifier?: string
}

export async function createDocumentLog({
  document,
  commit,
  parameters,
  customIdentifier,
}: IDocumentLogData) {
  const workspace = (await findWorkspaceFromCommit(commit))!
  const providerScope = new ProviderApiKeysRepository(workspace.id)

  const documentContent = await getResolvedContent({
    workspaceId: workspace.id,
    document,
    commit,
  }).then((r) => r.unwrap())

  const chain = createChain({
    prompt: documentContent,
    parameters: parameters ?? {},
  })
  let mockedResponse = undefined

  const documentLogUuid = uuid()
  const providerLogs: ProviderLog[] = []
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

  const duration =
    Math.floor(Math.random() * 100) +
    providerLogs.reduce((acc, log) => acc + log.duration, 0)

  const documentLog = await ogCreateDocumentLog({
    commit,
    data: {
      uuid: documentLogUuid,
      documentUuid: document.documentUuid,
      resolvedContent: documentContent,
      parameters: parameters ?? {},
      customIdentifier,
      source: LogSources.API,
      duration,
    },
  }).then((r) => r.unwrap())

  return {
    providerLogs,
    documentLog,
  }
}
