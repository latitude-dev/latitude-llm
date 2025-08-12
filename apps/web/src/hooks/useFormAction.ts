import { useCallback, useState, useTransition } from 'react'
import { FlattenedValidationErrors, ValidationErrors } from 'next-safe-action'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  type InferInputOrDefault,
  type SuccessActionCallback,
  ActionErrorKlass,
  ServerErrorKlass,
  ExecuteFn,
} from '$/hooks/useLatitudeAction'

export type ActionError<S extends StandardSchemaV1 | undefined> =
  FlattenedValidationErrors<ValidationErrors<S>>

export type ErrorActionCallback<S extends StandardSchemaV1> = (
  args: ActionErrorKlass<S> | ServerErrorKlass,
) => void

export function useFormAction<S extends StandardSchemaV1, Data>(
  execute: ExecuteFn<S, Data>,
  {
    onSuccess = () => {},
    onError,
  }: {
    onSuccess?: SuccessActionCallback<Data>
    onError?: ErrorActionCallback<S>
  } = {},
) {
  const [data, setData] = useState<Data | undefined>()
  const [error, setError] = useState<
    ActionErrorKlass<S> | ServerErrorKlass | null
  >(null)
  const [_, startTransition] = useTransition()

  const _action = useCallback(
    async (json: InferInputOrDefault<S, undefined>) => {
      const [data, err] = await execute(json)

      if (err) {
        onError?.(err)
        setError(err)
      } else if (data) {
        onSuccess({ data })
        setData(data)
      }
    },
    [execute, onError, onSuccess],
  )

  const action = useCallback(
    async (formData: FormData) => {
      const obj: Record<string, unknown> = {}
      formData.forEach((value, key) => {
        obj[key] = value
      })

      const json = obj as InferInputOrDefault<S, undefined>

      startTransition(() => {
        _action(json)
      })
    },
    [_action],
  )

  return { data, error, action }
}
