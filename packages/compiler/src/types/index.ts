import { Message } from './message'

export type Config = { [key: string]: unknown }

export type Conversation = {
  config: Config
  messages: Message[]
}

export * from './message'
