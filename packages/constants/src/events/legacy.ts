import { Message } from '@latitude-data/compiler'
import { ChainEventDtoResponse, PromptConfig } from '..'
import { FinishReason } from 'ai'

export enum LegacyChainEventTypes {
  Error = 'chain-error',
  Step = 'chain-step',
  Complete = 'chain-complete',
  StepComplete = 'chain-step-complete',
}

export type LegacyEventData =
  | {
      type: LegacyChainEventTypes.Step
      config: PromptConfig
      isLastStep: boolean
      messages: Message[]
      uuid?: string
    }
  | {
      type: LegacyChainEventTypes.StepComplete
      response: ChainEventDtoResponse
      uuid?: string
    }
  | {
      type: LegacyChainEventTypes.Complete
      config: PromptConfig
      finishReason?: FinishReason
      messages?: Message[]
      object?: any
      response: ChainEventDtoResponse
      uuid?: string
    }
  | {
      type: LegacyChainEventTypes.Error
      error: {
        name: string
        message: string
        stack?: string
      }
    }
