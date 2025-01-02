import { Chain as PromptlChain, Message as PromptlMessage } from 'promptl-ai'
import { FinishReason } from 'ai'

import { ChainStepResponse, StreamType } from '../../../constants'
import { ChainStreamConsumer } from '../ChainStreamConsumer'
import { ValidatedChainStep } from '../ChainValidator'
import { runStep, StepProps } from '../run'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../ProviderProcessor/saveOrPublishProviderLogs'
import { cacheChain } from '../chainCache'
import { buildMessagesFromResponse } from '../../../helpers'

function getToolCalls({
  response,
}: {
  response: ChainStepResponse<StreamType>
}) {
  const type = response.streamType
  if (type === 'object') return []

  const toolCalls = response.toolCalls ?? []

  return toolCalls
}

export async function buildStepExecution({
  streamConsumer,
  baseResponse,
  step,
  stepProps,
  providerLogProps: { streamType, finishReason, stepStartTime },
}: {
  streamConsumer: ChainStreamConsumer
  baseResponse: ChainStepResponse<StreamType>
  step: ValidatedChainStep
  stepProps: StepProps
  providerLogProps: {
    streamType: StreamType
    finishReason: FinishReason
    stepStartTime: number
  }
}) {
  const { chain } = stepProps
  const workspace = stepProps.workspace
  const documentLogUuid = stepProps.errorableUuid
  const providerLog = await saveOrPublishProviderLogs({
    workspace,
    streamType,
    finishReason,
    chainCompleted: step.chainCompleted,
    data: buildProviderLogDto({
      workspace,
      provider: step.provider,
      conversation: step.conversation,
      source: stepProps.source,
      errorableUuid: documentLogUuid,
      stepStartTime,
      response: baseResponse,
    }),
    // TODO: temp bugfix, shuold only save last one syncronously
    saveSyncProviderLogs: true,
  })

  async function executeStep({
    finalResponse,
  }: {
    finalResponse: ChainStepResponse<StreamType>
  }): Promise<ChainStepResponse<StreamType>> {
    const isPromptl = chain instanceof PromptlChain
    const toolCalls = getToolCalls({ response: finalResponse })
    const hasTools = isPromptl && toolCalls.length > 0
    const responseMessages = buildMessagesFromResponse({
      response: finalResponse,
    })

    if (hasTools) {
      await cacheChain({
        workspace,
        chain,
        documentLogUuid,
        responseMessages: responseMessages as unknown as PromptlMessage[],
      })
    }

    if (step.chainCompleted || hasTools) {
      streamConsumer.chainCompleted({
        step,
        response: finalResponse,
        finishReason,
        responseMessages,
      })

      return {
        ...finalResponse,
        finishReason,
        chainCompleted: step.chainCompleted,
      }
    }

    streamConsumer.stepCompleted(finalResponse)

    return runStep({
      ...stepProps,
      previousResponse: finalResponse,
    })
  }

  return { providerLog, executeStep }
}
