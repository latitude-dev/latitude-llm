import { useCallback, useState, useTransition } from 'react'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  type InferInputOrDefault,
  ActionErrorKlass,
  ServerErrorKlass,
  ExecuteFn,
} from '$/hooks/useLatitudeAction'

export type ErrorActionCallback<S extends StandardSchemaV1> = (
  args: ActionErrorKlass<S> | ServerErrorKlass,
) => void

function formDataToJson<S extends StandardSchemaV1>(formData: FormData) {
  const obj: Record<string, unknown> = {}
  formData.forEach((value, key) => {
    obj[key] = value
  })
  return obj as InferInputOrDefault<S, undefined>
}

export function useFormAction<S extends StandardSchemaV1, Data>(
  execute: ExecuteFn<S, Data>,
  {
    onSuccess = () => {},
    onError,
  }: {
    onSuccess?: (data: NonNullable<Data>) => void
    onError?: ErrorActionCallback<S>
  } = {},
) {
  const [data, setData] = useState<InferInputOrDefault<S, undefined>>()
  const [error, setError] = useState<
    ActionErrorKlass<S> | ServerErrorKlass | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const _action = useCallback(
    async (json: InferInputOrDefault<S, undefined>) => {
      const [payload, err] = await execute(json)

      if (err) {
        onError?.(err)
        setError(err)
      } else if (payload) {
        onSuccess(payload)
      }
    },
    [execute, onError, onSuccess],
  )

  const action = useCallback(
    async (formData: FormData) => {
      const json = formDataToJson<S>(formData)
      startTransition(async () => {
        setData(json)
        await _action(json)
      })
    },
    [_action],
  )

  return { data, isPending, error, action }
}
