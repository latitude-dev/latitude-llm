import { useEffect, useMemo } from 'react'
import { useLatteStore } from '$/stores/latte'
import { LatteChange } from '@latitude-data/constants/latte'
import useFetcher from '$/hooks/useFetcher'
import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { LatteInteraction } from './types'

type LatteThreadData = {
  interactions: LatteInteraction[]
  changes: LatteChange[]
}
type ApiData = { changes: LatteChange[]; providerLog: ProviderLogDto }

const EMPTY_DATA: LatteThreadData = { interactions: [], changes: [] }

function interactionsFromProviderLog(
  providerLog: ProviderLogDto,
): LatteInteraction[] {
  const messages = providerLog.messages || []
  const interactions: LatteInteraction[] = []
  let currentInteraction: LatteInteraction | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      if (currentInteraction) {
        interactions.push(currentInteraction)
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

    interactions.push(currentInteraction)
  }

  return interactions
}

/**
 * Fetches Latte thread's interactions and changes for the current thread UUID from the backend.
 */
const useLatteThread = () => {
  const { threadUuid } = useLatteStore()

  const apiEndpoint = threadUuid
    ? ROUTES.api.latte.thread.detail(threadUuid).root
    : undefined

  const fetcher = useFetcher<LatteThreadData, ApiData>(apiEndpoint, {
    fallback: EMPTY_DATA,
    serializer: (data) => ({
      interactions: interactionsFromProviderLog(data.providerLog),
      changes: data.changes,
    }),
  })

  const {
    data = EMPTY_DATA,
    isLoading,
    error,
  } = useSWR<LatteThreadData>(
    threadUuid ? ['latteThread', threadUuid] : null,
    fetcher,
    {
      // Only fetch if we have a threadUuid
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    } as SWRConfiguration,
  )

  return useMemo(() => ({ data, isLoading, error }), [data, isLoading, error])
}

/**
 * Loads and restores Latte changes from the backend based on the current thread UUID.
 * This hook fetches persisted changes for the thread and restores them to the store.
 * Only runs if there are no current changes in the store to avoid overriding active state.
 */
export function useLoadLatteThread() {
  const { interactions, setChanges, setInteractions } = useLatteStore()
  const { data, isLoading } = useLatteThread()

  useEffect(() => {
    // Skip if there are already interactions in the store
    if (interactions.length > 0) return

    // Only restore if there are no current changes in the store
    if (data.interactions.length === 0) return

    // Restore all data
    setChanges(data.changes)
    setInteractions(data.interactions)
  }, [data, interactions, setChanges, setInteractions])

  return isLoading
}
