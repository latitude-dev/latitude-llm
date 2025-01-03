import { ChainStepResponse, StreamType } from '../../constants'
import { ChainStreamConsumer } from './ChainStreamConsumer'
import { ValidatedStep } from './ChainValidator'
import { Chain as PromptlChain } from 'promptl-ai'
import { runStep, StepProps } from './run'
import { FinishReason } from 'ai'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from './ProviderProcessor/saveOrPublishProviderLogs'

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
  const providerLog = await saveOrPublishProviderLogs({
    workspace: stepProps.workspace,
    streamType,
    finishReason,
    data: buildProviderLogDto({
      provider: step.provider,
      conversation: step.conversation,
      workspace: stepProps.workspace,
      source: stepProps.source,
      errorableUuid: stepProps.errorableUuid,
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
    if (step.chainCompleted) {
      streamConsumer.chainCompleted({
        step,
        response: finalResponse,
      })

      return finalResponse
    }

    if (chain instanceof PromptlChain) {
      // TODO: Serialize chain when the response contains tool calls
      chain.serialize
    }

    streamConsumer.stepCompleted(finalResponse)

    // TODO: Do not run next step if the response contains some tool calls
    return runStep({
      ...stepProps,
      previousResponse: finalResponse,
    })
  }

  return { providerLog, executeStep }
}
