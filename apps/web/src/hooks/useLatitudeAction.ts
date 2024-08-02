import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import {
  inferServerActionError,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'
import { useServerAction } from 'zsa-react'

export default function useLatitudeAction<
  const TServerAction extends TAnyZodSafeFunctionHandler,
>(
  action: TServerAction,
  {
    onSuccess,
    onError,
  }: {
    onSuccess?: (args: {
      data: inferServerActionReturnData<TServerAction>
    }) => void
    onError?: (args: { err: inferServerActionError<TServerAction> }) => void
  } = {},
) {
  const { toast } = useToast()
  const successCb = useCallback(onSuccess || (() => {}), [onSuccess])
  const errorCb = useCallback(
    onError ||
      ((error: inferServerActionError<TServerAction>) => {
        if (error?.err?.code === 'INPUT_PARSE_ERROR') return

        toast({
          title: 'Error',
          description: error?.err?.message || error?.message,
          variant: 'destructive',
        })
      }),
    [onError],
  )

  return useServerAction(action, {
    onSuccess: successCb,
    onError: errorCb,
  })
}
