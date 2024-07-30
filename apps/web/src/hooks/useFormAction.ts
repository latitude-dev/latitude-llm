import { useCallback, useState } from 'react'

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
  const [error, setError] = useState()

  const action = useCallback(
    async (formData: FormData) => {
      const json = formDataToJson(
        formData,
      ) as inferServerActionInput<TServerAction>
      setData(json)

      const result = await exec(json)
      const [payload, error] = result

      if (error) {
        if (onError) onError(error)
        setError(error)
      } else {
        if (onSuccess) onSuccess(payload!)
        setData(payload!)
      }

      return result
    },
    [exec, onSuccess, onError],
  )

  return { data, error, action }
}
