import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import {
  inferServerActionError,
  inferServerActionInput,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'

export default function useLatitudeAction<
  const TServerAction extends TAnyZodSafeFunctionHandler,
>(
  action: TServerAction,
  {
    onSuccess,
    onError,
  }: {
    onSuccess?: (payload: inferServerActionReturnData<TServerAction>) => void
    onError?: (error: inferServerActionError<TServerAction>) => void
  } = {},
) {
  const { toast } = useToast()
  const successCb = useCallback(onSuccess || (() => {}), [onSuccess])
  const errorCb = useCallback(
    onError ||
      ((error: Error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      }),
    [onError],
  )

  const execute = useCallback(
    async (
      data: inferServerActionInput<TServerAction>,
    ): Promise<
      | [inferServerActionReturnData<TServerAction>, null]
      | [null, inferServerActionError<TServerAction>]
    > => {
      const result = await action(data)
      const [payload, error] = result
      if (error) {
        errorCb(error)
      } else {
        successCb(payload)
      }

      return result
    },
    [action, successCb, errorCb],
  )

  return { execute }
}
