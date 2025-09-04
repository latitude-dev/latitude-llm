import { useEffect, useMemo } from 'react'
import { useLatteStore } from '$/stores/latte'
import useProviderLogs, { useProviderLog } from '$/stores/providerLogs'

import { sortBy } from 'lodash-es'
import { LatteInteraction } from './types'

/**
 * Fetches the latest provider log for the current thread UUID.
 */
const useLatteThreadProviderLog = ({ threadUuid }: { threadUuid?: string }) => {
  const { data: providerLogs, isLoading } = useProviderLogs({
    documentLogUuid: threadUuid,
  })
  const { data: providerLog } = useProviderLog(
    sortBy(providerLogs, 'generatedAt').at(-1)?.id,
  )
  return useMemo(() => ({ providerLog, isLoading }), [providerLog, isLoading])
}

/**
 * Loads and transforms provider logs into Latte interactions.
 * Fetches provider logs for the current thread UUID and converts them
 * into a structured format of user-assistant interactions with input/output pairs.
 * Only runs if there are no previous interactions stored in the current chat state so to avoid overriding the current state.
 */
export function useLoadThreadFromProviderLogs() {
  const { threadUuid, interactions, setInteractions } = useLatteStore()
  const { providerLog, isLoading } = useLatteThreadProviderLog({ threadUuid })

  useEffect(() => {
    if (interactions.length > 0) return
    if (!providerLog) return

    // iterate over provider log messages and transform them to an array of interactions.
    // Interactors are input/output pairs input defined as any message from a user and outputs
    // defined as all messages not from user until the next user message.
    const messages = providerLog.messages || []
    const _interactions: LatteInteraction[] = []
    let currentInteraction: LatteInteraction | null = null

    for (const message of messages) {
      if (message.role === 'user') {
        if (currentInteraction) {
          _interactions.push(currentInteraction)
        }

        currentInteraction = {
          input:
            message.content.filter((t) => t.type === 'text').at(-1)?.text ?? '',
          steps: [],
        }
      } else if (message.role === 'assistant' && currentInteraction) {
        const textContent =
          typeof message.content === 'string'
            ? message.content
            : // @ts-expect-error - cast message content to TextContent
              (message.content.filter((t) => t.type === 'text').at(-1)?.text ??
              '')

        if (textContent) {
          currentInteraction.steps.push({
            type: 'text',
            text: textContent,
          })
        }
      }
    }

    if (currentInteraction) {
      if (providerLog.response) {
        currentInteraction.steps.push({
          type: 'text',
          text: providerLog.response,
        })
      }

      _interactions.push(currentInteraction)
    }

    if (_interactions.length > 0) {
      setInteractions(_interactions)
    }
  }, [providerLog, setInteractions, interactions])

  return isLoading
}
