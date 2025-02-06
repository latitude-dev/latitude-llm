import { useCallback, useState } from 'react'

import {
  LegacyChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/core/browser'
import { readStreamableValue } from 'ai/rsc'

type OnEventHandler = (event: string, data: any) => void

export function useStreamableAction<T extends (...args: any[]) => any>(
  action: T,
  onEvent?: OnEventHandler,
) {
  const [responseStream, setResponseStream] = useState<string | undefined>()
  const [isLoading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<Error | undefined>()

  const runAction = useCallback(
    async (...args: any[]) => {
      setResponseStream(undefined)
      setDone(false)
      setError(undefined)
      setLoading(true)

      try {
        const { response: actionResponse, output } = await action(...args)
        if (error) {
          setError(error)
          setLoading(false)
          return
        }

        let response = ''

        for await (const serverEvent of readStreamableValue(output)) {
          if (!serverEvent) continue

          // @ts-expect-error - TODO: fix this
          const { event, data } = serverEvent
          onEvent?.(event, data)

          switch (event) {
            case StreamEventTypes.Latitude: {
              if (data.type === LegacyChainEventTypes.Complete) {
                setResponseStream(undefined)
                setDone(true)
                setLoading(false)
              } else if (data.type === LegacyChainEventTypes.Error) {
                setError(new Error(data.error.message))
                setLoading(false)
              }
              break
            }

            case StreamEventTypes.Provider: {
              if (data.type === 'text-delta') {
                response += data.textDelta
                setResponseStream(response)
              }
              break
            }
          }
        }

        return actionResponse
      } catch (err) {
        setError(err as Error)
        setLoading(false)
      }
    },
    [action, onEvent],
  )

  return { runAction, responseStream, done, error, isLoading }
}
