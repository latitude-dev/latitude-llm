import { faker } from '@faker-js/faker'
import {
  ContentType,
  type Conversation,
  createChain,
} from '@latitude-data/compiler'
import { Adapters, Chain as PromptlChain } from 'promptl-ai'
import { LanguageModelUsage } from 'ai'
import { eq } from 'drizzle-orm'

import {
  DocumentLog,
  EvaluationDto,
  EvaluationMetadataType,
  LogSources,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access'
import { findCommitById } from '../../data-access/commits'
import { generateUUIDIdentifier } from '../../lib'
import { ProviderApiKeysRepository } from '../../repositories'
import { evaluationResults } from '../../schema'
import { Config } from '../../services/ai'
import { createEvaluationResult as createEvaluationResultService } from '../../services/evaluationResults'
import { getEvaluationPrompt } from '../../services/evaluations'
import { createProviderLog } from '../../services/providerLogs'

type ProviderLogProps = {
  evaluation: EvaluationDto
  documentLog: DocumentLog
  stepCosts?: {
    costInMillicents: number
    promptTokens: number
    completionTokens: number
  }[]
  result?: string
  reason?: string
}
async function generateEvaluationProviderLogs({
  evaluation,
  documentLog,
  stepCosts,
  result,
  reason,
}: ProviderLogProps) {
  const commit = await findCommitById({ id: documentLog.commitId }).then((r) =>
    r.unwrap(),
  )
  const workspace = (await findWorkspaceFromCommit(commit))!
  const providerScope = new ProviderApiKeysRepository(workspace.id)
  const evaluationPrompt = await getEvaluationPrompt({
    workspace,
    evaluation,
  }).then((r) => r.unwrap())

  const usePromptl =
    evaluation.metadataType !== EvaluationMetadataType.LlmAsJudgeAdvanced ||
    evaluation.metadata.promptlVersion !== 0

  const chain = usePromptl
    ? new PromptlChain({
        prompt: evaluationPrompt,
        parameters: {}, // TODO: Generate parameters from documentLog
        adapter: Adapters.default,
      })
    : createChain({
        prompt: evaluationPrompt,
        parameters: {}, // TODO: Generate parameters from documentLog
      })

  const providerLogs: ProviderLog[] = []
  let mockedResponse = undefined
  let steps = 0
  while (true) {
    const { completed, ...rest } = await chain.step(mockedResponse)
    if (usePromptl && completed) break

    const conversation: Conversation = usePromptl
      ? (rest as unknown as Conversation)
      : (rest as { conversation: Conversation }).conversation

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
      workspace,
      uuid: generateUUIDIdentifier(),
      generatedAt: new Date(),
      providerId: provider.id,
      providerType: provider.provider,
      model: config.model!,
      config: config,
      messages: conversation.messages,
      responseText: mockedResponse,
      responseObject: reason ? { reason, result } : undefined,
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

  const evaluationProviderLog = providerLogs[providerLogs.length - 1]!

  return { evaluationProviderLog, providerLogs, mockedResponse: mockedResponse }
}

export type IEvaluationResultData = ProviderLogProps & {
  evaluatedProviderLog: ProviderLog
  skipProviderLogCreation?: boolean
  skipEvaluationResultCreation?: boolean
  evaluationResultUuid?: string
  evaluationResultCreatedAt?: Date
  evaluationResultUpdatedAt?: Date
}

export async function createEvaluationResult({
  evaluationResultUuid,
  documentLog,
  evaluatedProviderLog,
  evaluation,
  result,
  reason,
  stepCosts,
  skipProviderLogCreation = false,
  skipEvaluationResultCreation = false,
  evaluationResultCreatedAt,
  evaluationResultUpdatedAt,
}: IEvaluationResultData) {
  const noEvaluationProvider =
    evaluation.metadataType === EvaluationMetadataType.Manual ||
    skipProviderLogCreation
  const { evaluationProviderLog, providerLogs, mockedResponse } =
    noEvaluationProvider
      ? {
          evaluationProviderLog: undefined,
          providerLogs: [],
          mockedResponse: { result: result ?? '', reason: reason ?? '' },
        }
      : await generateEvaluationProviderLogs({
          evaluation,
          documentLog,
          result,
          reason,
          stepCosts,
        })

  let evaluationResult = await createEvaluationResultService({
    uuid: evaluationResultUuid ?? generateUUIDIdentifier(),
    evaluation,
    documentLog,
    evaluatedProviderLog,
    evaluationProviderLog,
    createdAt: evaluationResultCreatedAt,
    updatedAt: evaluationResultUpdatedAt,
    result: skipEvaluationResultCreation
      ? undefined
      : {
          result:
            typeof mockedResponse === 'string'
              ? mockedResponse
              : mockedResponse!.result,
          reason:
            typeof mockedResponse === 'object' && 'reason' in mockedResponse
              ? mockedResponse.reason
              : 'I do not even know to be honest.',
        },
  }).then((r) => r.unwrap())

  if (!evaluationResultCreatedAt) {
    // Tests run within a transaction and the NOW() PostgreSQL function returns
    // the transaction start time. Therefore, all results would be created
    // at the same time, messing with tests. This code patches this.
    await database
      .update(evaluationResults)
      .set({ createdAt: new Date() })
      .where(eq(evaluationResults.id, evaluationResult.id))
  }

  return {
    evaluationResult: evaluationResult,
    providerLogs: providerLogs,
  }
}
