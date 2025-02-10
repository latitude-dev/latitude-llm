import { Message } from '@latitude-data/compiler'
import { ChainEventDtoResponse, Config } from '..'
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
      config: Config
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
      config: Config
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
