import { Message } from './compiler'
import { ChainEventDtoResponse } from '..'
import { FinishReason } from 'ai'
import { LatitudePromptConfig } from '../latitudePromptSchema'

export enum LegacyChainEventTypes {
  Error = 'chain-error',
  Step = 'chain-step',
  Complete = 'chain-complete',
  StepComplete = 'chain-step-complete',
}

export type LegacyEventData =
  | {
      type: LegacyChainEventTypes.Step
      config: LatitudePromptConfig
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
      config: LatitudePromptConfig
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
