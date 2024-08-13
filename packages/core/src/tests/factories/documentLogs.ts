import { faker } from '@faker-js/faker'
import { ContentType, createChain } from '@latitude-data/compiler'
import { Commit, DocumentVersion, LogSources, ProviderLog } from '$core/browser'
import { findWorkspaceFromCommit } from '$core/data-access'
import { ProviderApiKeysRepository } from '$core/repositories'
import {
  Config,
  createProviderLog,
  getResolvedContent,
  createDocumentLog as ogCreateDocumentLog,
} from '$core/services'
import { v4 as uuid } from 'uuid'

export type IDocumentLogData = {
  document: DocumentVersion
  commit: Commit
  parameters?: Record<string, unknown>
  customIdentifier?: string
}

const randomSentence = () => {
  const randomSentenceGenerators = [
    faker.commerce.productDescription,
    faker.hacker.phrase,
    faker.company.catchPhrase,
    faker.lorem.sentence,
  ]

  return randomSentenceGenerators[
    Math.floor(Math.random() * randomSentenceGenerators.length)
  ]!()
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
    workspace,
    documentUuid: document.documentUuid,
    commit,
  }).then((r) => r.unwrap())

  const chain = createChain({
    prompt: documentContent,
    parameters: parameters ?? {},
  })
  let mockedResponse = undefined

  const providerLogs: ProviderLog[] = []
  while (true) {
    const { completed, conversation } = await chain.step(mockedResponse)

    const config = conversation.config as Config
    const provider = await providerScope
      .findByName(config.provider)
      .then((r) => r.unwrap())

    mockedResponse = randomSentence()

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
      providerId: provider.id,
      providerType: provider.provider,
      model: config.model,
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
    workspace,
    uuid: uuid(),
    documentUuid: document.documentUuid,
    commit,
    resolvedContent: documentContent,
    parameters: parameters ?? {},
    customIdentifier,
    duration,
    providerLogUuids: providerLogs.map((log) => log.uuid),
  }).then((r) => r.unwrap())

  return {
    providerLogs,
    documentLog,
  }
}
