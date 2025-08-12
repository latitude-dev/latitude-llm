import { useCallback, useMemo } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { FlattenedValidationErrors, ValidationErrors } from 'next-safe-action'
import {
  HookSafeActionFn,
  useAction,
  HookCallbacks,
} from 'next-safe-action/hooks'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type InferInputOrDefault<MaybeSchema, Default> =
  MaybeSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<MaybeSchema>
    : Default

export type ActionError<S extends StandardSchemaV1 | undefined> =
  FlattenedValidationErrors<ValidationErrors<S>>

type OnSuccessArgs<
  ServerError,
  S extends StandardSchemaV1,
  CVE extends ActionError<S>,
  Data,
> = Parameters<
  NonNullable<HookCallbacks<ServerError, S, CVE, Data>['onSuccess']>
>[0]

type OnErrorArgs<
  ServerError,
  S extends StandardSchemaV1,
  CVE extends ActionError<S>,
  Data,
> = Parameters<
  NonNullable<HookCallbacks<ServerError, S, CVE, Data>['onError']>
>[0]

export type LatitudeGenericActionFunc = (input: any) => Promise<any>
export type LatitudeData<F extends LatitudeGenericActionFunc> =
  Awaited<ReturnType<F>> extends
    | readonly [infer D, null]
    | readonly [null, any]
    | readonly [null, null]
    ? D
    : never

export class ServerErrorKlass extends Error {
  code: 'ERROR' = 'ERROR' as const
  formErrors = undefined
  fieldErrors = undefined

  constructor(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    super(msg)
  }
}
export class ActionErrorKlass<S extends StandardSchemaV1> extends Error {
  formErrors?: ActionError<S>['formErrors']
  fieldErrors?: ActionError<S>['fieldErrors']
  code: 'VALIDATION_ERROR' = 'VALIDATION_ERROR' as const

  constructor(error: ActionError<S>) {
    super('Validation Error')
    this.formErrors = error.formErrors
    this.fieldErrors = error.fieldErrors
  }
}

export type SuccessActionCallback<Data> = (args: { data: Data }) => void
export type ErrorActionCallback = (args: ServerErrorKlass) => void

export type ExecuteFn<S extends StandardSchemaV1, Data> = (
  input: InferInputOrDefault<S, void>,
) => Promise<
  | readonly [Data, null]
  | readonly [null, ActionErrorKlass<S> | ServerErrorKlass]
>

export function buildActionError<S extends StandardSchemaV1>({
  validationErrors,
  serverError,
}: {
  validationErrors?: ActionError<S>
  serverError?: unknown
}) {
  if (validationErrors) return new ActionErrorKlass<S>(validationErrors)
  return new ServerErrorKlass(serverError)
}

/**
 * Wrapper around useAction with toast feedback.
 * Accepts SafeActionFn (server action) directly.
 */
export default function useLatitudeAction<
  ServerError,
  S extends StandardSchemaV1,
  CVE extends ActionError<S>,
  Data,
>(
  serverAction: HookSafeActionFn<ServerError, S, CVE, Data>,
  {
    onSuccess,
    onError,
  }: {
    onSuccess?: SuccessActionCallback<Data>
    onError?: ErrorActionCallback
  } = {},
) {
  const { toast } = useToast()

  const successCb = useCallback(
    (args: OnSuccessArgs<ServerError, S, CVE, Data>) => {
      if (args.data === undefined) return

      if (onSuccess) {
        onSuccess({ data: args.data })
      } else {
        toast({
          title: 'Success',
          description: 'Action completed successfully',
        })
      }

      return args
    },
    [onSuccess, toast],
  )

  const errorCb = useCallback(
    (err: OnErrorArgs<ServerError, S, CVE, Data>) => {
      if (!err.error.serverError) return

      const serverError = new ServerErrorKlass(err.error.serverError)

      if (onError) return onError(serverError)

      toast({
        title: 'Error',
        variant: 'destructive',
        description: serverError.message,
      })
    },
    [onError, toast],
  )

  const options = useMemo(
    () => ({
      onSuccess: successCb,
      onError: errorCb,
    }),
    [successCb, errorCb],
  )

  const action = useAction(serverAction, options)
  const executeFn = useCallback(
    async (input: InferInputOrDefault<S, void>) => {
      const result = await action.executeAsync(input)

      if (result.serverError || result.validationErrors) {
        return [
          null,
          buildActionError({
            validationErrors: result.validationErrors,
            serverError: result.serverError,
          }),
        ] as const
      }

      return [result.data!, null] as const
    },
    [action],
  )

  return useMemo(
    () => ({
      input: action.input,
      reset: action.reset,
      result: action.result,
      isPending: action.isPending,
      execute: executeFn,
      error: action.result.validationErrors
        ? new ActionErrorKlass<S>(action.result.validationErrors)
        : undefined,
    }),
    [action, executeFn],
  )
}
