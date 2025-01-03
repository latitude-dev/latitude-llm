import { Chain as PromptlChain } from 'promptl-ai'
import { FinishReason } from 'ai'

import { ChainStepResponse, StreamType } from '../../../constants'
import { ChainStreamConsumer } from '../ChainStreamConsumer'
import { ValidatedStep } from '../ChainValidator'
import { runStep, StepProps, SomeChain } from '../run'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../ProviderProcessor/saveOrPublishProviderLogs'
import { cacheChain } from '../chainCache'

function hasToolCalls({
  response,
}: {
  response: ChainStepResponse<StreamType>
}) {
  const type = response.streamType
  if (type === 'object') return false

  const toolCalls = response.toolCalls ?? []
  return toolCalls.length > 0
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
  step: ValidatedStep
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
    const hasTools = isPromptl && hasToolCalls({ response: finalResponse })

    if (hasTools) {
      await cacheChain({ workspace, chain, documentLogUuid })
    }

    if (step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: finalResponse,
      })

      return finalResponse
    }

    streamConsumer.stepCompleted(finalResponse)

    if (hasTools) {
      // Stop chain execution if there are tool calls
      return finalResponse
    } else {
      return runStep({
        ...stepProps,
        previousResponse: finalResponse,
      })
    }
  }

  return { providerLog, executeStep }
}
