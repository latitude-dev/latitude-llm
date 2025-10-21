import {
  MessageContent,
  ToolContent,
} from '@latitude-data/constants/legacyCompiler'

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  size?: 'default' | 'small'
  animatePulse?: boolean
  parameters?: string[]
  debugMode?: boolean
  toolContentMap?: Record<string, ToolContent>
  isGeneratingToolCall?: boolean
  additionalAssistantMessage?: boolean
}
