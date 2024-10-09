import { faker } from '@faker-js/faker'
import { ContentType, createChain } from '@latitude-data/compiler'
import { LanguageModelUsage } from 'ai'

import {
  DocumentLog,
  EvaluationDto,
  LogSources,
  ProviderLog,
} from '../../browser'
import { findWorkspaceFromCommit } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { generateUUIDIdentifier } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { Config } from '../../services/ai'
import { createEvaluationResult as createEvaluationResultService } from '../../services/evaluationResults'
import { createProviderLog } from '../../services/providerLogs'

export type IEvaluationResultData = {
  documentLog: DocumentLog
  evaluation: EvaluationDto
  result?: string
  stepCosts?: {
    costInMillicents: number
    promptTokens: number
    completionTokens: number
  }[]
  skipProviderLogCreation?: boolean
  skipEvaluationResultCreation?: boolean
  evaluationResultUuid?: string
}

export async function createEvaluationResult({
  evaluationResultUuid,
  documentLog,
  evaluation,
  result,
  stepCosts,
  skipProviderLogCreation = false,
  skipEvaluationResultCreation = false,
}: IEvaluationResultData) {
  const commit = await findCommitById({ id: documentLog.commitId }).then((r) =>
    r.unwrap(),
  )
  const workspace = (await findWorkspaceFromCommit(commit))!
  const providerScope = new ProviderApiKeysRepository(workspace.id)

  const chain = createChain({
    prompt: evaluation.metadata.prompt,
    parameters: {}, // TODO: Generate parameters from documentLog
  })

  const providerLogs: ProviderLog[] = []
  let mockedResponse = undefined
  let steps = 0
  while (true) {
    const { completed, conversation } = await chain.step(mockedResponse)

    const config = conversation.config as Config
    const provider = await providerScope
      .findByName(config.provider!)
      .then((r) => r.unwrap())

    mockedResponse = result ?? String(faker.number.int({ min: 0, max: 10 }))

    const promptTokensFromContent = conversation.messages.reduce(
      (acc, message) => {
        let content = message.content
        if (Array.isArray(content)) {
          content = content
            .map((c) => (c.type === ContentType.text ? c.text : ''))
            .join('')
        }
        return acc + content.length
      },
      0,
    )
    const completionTokensFromContent = mockedResponse.length
    const totalTokens = promptTokensFromContent + completionTokensFromContent

    let costInMillicents: number | undefined = undefined
    let usage: LanguageModelUsage = {
      promptTokens: promptTokensFromContent,
      completionTokens: completionTokensFromContent,
      totalTokens: totalTokens,
    }

    if (stepCosts !== undefined) {
      const stepCost = stepCosts[steps]
      if (stepCost === undefined) {
        throw new Error(
          'Number of steps does not match the number of step costs.',
        )
      }

      usage = {
        promptTokens: stepCost.promptTokens,
        completionTokens: stepCost.completionTokens,
        totalTokens: stepCost.promptTokens + stepCost.completionTokens,
      }
      costInMillicents = stepCost.costInMillicents
    }

    const log = await createProviderLog({
      uuid: generateUUIDIdentifier(),
      generatedAt: new Date(),
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
      model: config.model!,
      config: config,
      messages: conversation.messages,
      responseText: mockedResponse,
      toolCalls: [],
      usage,
      costInMillicents,
      duration: Math.floor(Math.random() * 1000),
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    providerLogs.push(log)

    steps = steps + 1

    if (completed) break
  }

  if (stepCosts && stepCosts.length !== steps) {
    throw new Error('Number of steps does not match the number of step costs.')
  }

  const evaluationResult = await createEvaluationResultService({
    uuid: evaluationResultUuid ?? generateUUIDIdentifier(),
    evaluation,
    documentLog,
    providerLog: skipProviderLogCreation
      ? undefined
      : providerLogs[providerLogs.length - 1]!,
    result: skipEvaluationResultCreation
      ? undefined
      : {
          result: mockedResponse,
          reason: 'I do not even know to be honest.',
        },
  })

  return {
    evaluationResult: evaluationResult.unwrap(),
    providerLogs: providerLogs,
  }
}
