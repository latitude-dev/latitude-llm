import { faker } from '@faker-js/faker'
import { ContentType, createChain } from '@latitude-data/compiler'
import { DocumentLog, Evaluation, LogSources, ProviderLog } from '$core/browser'
import { findWorkspaceFromCommit } from '$core/data-access'
import { findCommitById } from '$core/data-access/commits'
import { ProviderApiKeysRepository } from '$core/repositories'
import {
  Config,
  createEvaluationResult as createEvaluationResultService,
  createProviderLog,
} from '$core/services'
import { v4 as uuid } from 'uuid'

export type IEvaluationResultData = {
  documentLog: DocumentLog
  evaluation: Evaluation
}

export async function createEvaluationResult({
  documentLog,
  evaluation,
}: IEvaluationResultData) {
  const commit = await findCommitById({ id: documentLog.commitId }).then((r) =>
    r.unwrap(),
  )
  const workspace = (await findWorkspaceFromCommit(commit))!

  const providerScope = new ProviderApiKeysRepository(workspace.id)

  const chain = createChain({
    prompt: evaluation.prompt,
    parameters: {},
  })

  const providerLogs: ProviderLog[] = []
  let mockedResponse = undefined
  while (true) {
    const { completed, conversation } = await chain.step(mockedResponse)

    const config = conversation.config as Config
    const provider = await providerScope
      .findByName(config.provider)
      .then((r) => r.unwrap())

    mockedResponse = String(faker.number.int({ min: 0, max: 10 }))

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
      documentLogUuid: documentLog.uuid,
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
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    providerLogs.push(log)

    if (completed) break
  }

  const evaluationResult = await createEvaluationResultService({
    evaluation,
    documentLog,
    providerLog: providerLogs[providerLogs.length - 1]!,
    result: mockedResponse,
  })

  return evaluationResult.unwrap()
}
