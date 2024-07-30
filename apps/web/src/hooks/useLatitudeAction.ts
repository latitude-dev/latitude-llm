import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import {
  inferServerActionError,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'

function formDataToJson(data: FormData) {
  const json: { [key: string]: unknown } = {}
  data.forEach((value, key) => {
    json[key] = value
  })
  return json
}

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

  // default callbacks
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
    async (data: { [key: string]: unknown }) => {
      const [payload, error] = await action(data)
      if (error) return errorCb(error)

      return successCb(payload)
    },
    [action, successCb, errorCb],
  )

  const executeFormAction = useCallback(
    async (data: FormData) => execute(formDataToJson(data)),
    [action, execute],
  )

  return { execute, executeFormAction }
}
