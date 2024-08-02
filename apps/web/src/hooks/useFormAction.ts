import { useCallback, useState, useTransition } from 'react'

import {
  inferServerActionError,
  inferServerActionInput,
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

export function useFormAction<
  const TServerAction extends TAnyZodSafeFunctionHandler,
>(
  exec: (
    data: inferServerActionInput<TServerAction>,
  ) => Promise<
    | [inferServerActionReturnData<TServerAction>, null]
    | [null, inferServerActionError<TServerAction>]
  >,
  {
    onSuccess = () => {},
    onError,
  }: {
    onSuccess?: (payload: inferServerActionReturnData<TServerAction>) => void
    onError?: (error: inferServerActionError<TServerAction>) => void
  } = {
    onSuccess: () => {},
  },
) {
  const [data, setData] = useState<
    | inferServerActionInput<TServerAction>
    | inferServerActionReturnData<TServerAction>
  >()
  const [_, startTransition] = useTransition()
  const [error, setError] = useState<Record<string, unknown> | undefined>()
  const _action = useCallback(
    async (json: inferServerActionInput<TServerAction>) => {
      const result = await exec(json)
      const [payload, error] = result

      if (error) {
        onError?.(error)
        setError(error)
      } else {
        onSuccess(payload!)
        setData(payload!)
      }
    },
    [exec, setError, setData],
  )

  const action = useCallback(
    async (formData: FormData) => {
      const json = formDataToJson(
        formData,
      ) as inferServerActionInput<TServerAction>

      startTransition(() => {
        setData(json)
        _action(json)
      })
    },
    [exec],
  )

  return { data, error, action }
}
