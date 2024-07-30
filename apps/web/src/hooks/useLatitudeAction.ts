import { useCallback } from 'react'

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
    onSuccess: (payload: inferServerActionReturnData<TServerAction>) => void
    onError: (error: inferServerActionError<TServerAction>) => void
  } = { onSuccess: () => {}, onError: () => {} },
) {
  const execute = useCallback(
    async (data: { [key: string]: unknown }) => {
      const [payload, error] = await action(data)

      if (error) {
        return onError(error)
      }
      return onSuccess(payload)
    },
    [action, onSuccess, onError],
  )

  const executeFormAction = useCallback(
    async (data: FormData) => {
      const [payload, error] = await action(formDataToJson(data))

      if (error) {
        return onError(error)
      }
      return onSuccess(payload)
    },
    [action, onSuccess, onError],
  )

  return { execute, executeFormAction }
}
