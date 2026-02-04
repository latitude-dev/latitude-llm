import {
  MessageContent,
  ToolResultContent,
} from '@latitude-data/constants/messages'

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  size?: 'default' | 'small'
  animatePulse?: boolean
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolResultContent>
  isGeneratingToolCall?: boolean
  additionalAssistantMessage?: boolean
  messageIndex?: number
  isStreaming?: boolean
}
