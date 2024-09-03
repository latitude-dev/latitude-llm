import { type AssistantMessage } from '@latitude-data/compiler'

import { DocumentLog, ProviderLog } from '../../../browser'

type ParameterFromLogFn = (_: {
  documentLog: DocumentLog
  providerLog: ProviderLog
}) => unknown

export const PARAMETERS_FROM_LOG: Record<string, ParameterFromLogFn> = {
  messages: ({ providerLog }: { providerLog: ProviderLog }) => {
    const assistantMessage = {
      role: 'assistant',
      content: providerLog.responseText,
      toolCalls: providerLog.toolCalls,
    } as AssistantMessage
    return [...providerLog.messages, assistantMessage]
  },
  response: ({ providerLog }: { providerLog: ProviderLog }) =>
    providerLog.responseText,
}
