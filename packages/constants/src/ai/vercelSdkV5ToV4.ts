import { ToolResultPart, ModelMessage as VercelV5Message } from 'ai'
import { AssistantMessage, ToolMessage } from '../messages'
import { ToolSourceData } from '../toolSources'

export type ReplaceTextDelta<T> = T extends {
  type: 'text-delta'
  text: infer Text
  providerMetadata?: infer PM
}
  ? { type: 'text-delta'; providerMetadata?: PM; textDelta: Text }
  : T extends {
        type: 'tool-call'
      }
    ? Omit<T, 'input'> & {
        args: Record<string, unknown>
        _sourceData?: ToolSourceData
      }
    : T extends {
          type: 'tool-result'
        }
      ? Omit<T, 'output' | 'input'> & {
          args: Record<string, unknown>
          result: any
        }
      : T

/**
 * Legacy type from Vercel SDK v4.
 * Keeping this because is used in our core
 */
export type ToolExecutionOptions = {
  /**
   * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
   */
  toolCallId: string
  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  messages: VercelV5Message[]
  /**
   * An optional abort signal that indicates that the overall operation should be aborted.
   */
  abortSignal?: AbortSignal
}

export type LegacyVercelSDKToolResultPart = Omit<ToolResultPart, 'output'> & {
  result: string | ToolResultPart['output']
}

export type LegacyVercelSDKVersion4ToolContent =
  Array<LegacyVercelSDKToolResultPart>
export type LegacyResponseMessage = AssistantMessage | ToolMessage
export type LegacyVercelSDKVersion4Usage = {
  /**
   * The number of input (prompt) tokens used.
   */
  inputTokens: number
  /**
   * The number of output (completion) tokens used.
   */
  outputTokens: number
  /**
   * The number of input (prompt) tokens used.
   * DEPRECATED: use `inputTokens` instead.
   */
  promptTokens: number
  /**
  The number of output (completion) tokens used.
  DEPRECATED: use `outputTokens` instead.
     */
  completionTokens: number
  /**
  The total number of tokens as reported by the provider.
  This number might be different from the sum of `inputTokens` and `outputTokens`
  and e.g. include reasoning tokens or other overhead.
     */
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}
