import { Message as CompilerMessage, Config } from '@latitude-data/compiler'
import { CompletionTokenUsage, CoreTool, TextStreamPart } from 'ai'

export const LATITUDE_DOCS_URL = ''
export const LATITUDE_EMAIL = ''
export const LATITUDE_HELP_URL = ''
export const LATITUDE_SLACK_URL =
  'https://join.slack.com/t/trylatitude/shared_invite/zt-17dyj4elt-rwM~h2OorAA3NtgmibhnLA'
export const HEAD_COMMIT = 'live'
export const LATITUDE_CHANGELOG_URL = ''
export enum CommitStatus {
  All = 'all',
  Merged = 'merged',
  Draft = 'draft',
}

export type Message = CompilerMessage

export enum ModifiedDocumentType {
  Created = 'created',
  Updated = 'updated',
  Deleted = 'deleted',
}

export const HELP_CENTER = {
  commitVersions: `${LATITUDE_DOCS_URL}/not-found`,
}

export type ChainCallResponse = { text: string; usage: CompletionTokenUsage }
export enum Providers {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Groq = 'groq',
  Mistral = 'mistral',
  Azure = 'azure',
}

export enum LogSources {
  Playground = 'playground',
  API = 'api',
}
export enum StreamEventTypes {
  Latitude = 'latitude-event',
  Provider = 'provider-event',
}

export enum ChainEventTypes {
  Error = 'chain-error',
  Step = 'chain-step',
  Complete = 'chain-complete',
  StepComplete = 'chain-step-complete',
}

type ProviderData = TextStreamPart<Record<string, CoreTool>>
export type ProviderDataType = ProviderData['type']

type LatitudeEventData =
  | {
      type: ChainEventTypes.Step
      config: Config
      isLastStep: boolean
      messages: Message[]
    }
  | {
      type: ChainEventTypes.StepComplete
      response: ChainCallResponse
    }
  | {
      type: ChainEventTypes.Complete
      config: Config
      messages: Message[]
      response: ChainCallResponse
    }
  | {
      type: ChainEventTypes.Error
      error: Error
    }

export type ChainEvent =
  | {
      data: LatitudeEventData
      event: StreamEventTypes.Latitude
    }
  | {
      data: ProviderData
      event: StreamEventTypes.Provider
    }
