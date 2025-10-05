import { useCallback, useMemo } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { FlattenedValidationErrors, ValidationErrors } from 'next-safe-action'
import {
  HookSafeActionFn,
  useAction,
  HookCallbacks,
} from 'next-safe-action/hooks'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { useRouter } from 'next/navigation'
import { isFrontendRedirect } from '$/lib/frontendRedirect'

export type InferInputOrDefault<MaybeSchema, Default> =
  MaybeSchema extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<MaybeSchema>
    : Default

export type ActionError<S extends ActionSchema> = S extends StandardSchemaV1
  ? FlattenedValidationErrors<NonNullable<ValidationErrors<S>>>
  : { formErrors: string[]; fieldErrors: {} } | undefined

type NormalizedActionErrorShape<S extends StandardSchemaV1 | undefined> =
  S extends StandardSchemaV1
    ? FlattenedValidationErrors<ValidationErrors<S>>
    : {
        formErrors: string[]
        fieldErrors: {}
      }

export type ActionSchema = StandardSchemaV1 | undefined
export type OnSuccessArgs<
  ServerError,
  S extends ActionSchema,
  CVE extends ActionError<S | undefined>,
  Data,
> = Parameters<
  NonNullable<HookCallbacks<ServerError, S, CVE, Data>['onSuccess']>
>[0]

type OnErrorArgs<
  ServerError,
  S extends ActionSchema,
  CVE extends ActionError<S | undefined>,
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
export class ActionErrorKlass<
  S extends StandardSchemaV1 | undefined,
> extends Error {
  formErrors?: NormalizedActionErrorShape<S>['formErrors']
  fieldErrors?: NormalizedActionErrorShape<S>['fieldErrors']
  code: 'VALIDATION_ERROR' = 'VALIDATION_ERROR' as const

  constructor(error: ActionError<S>) {
    super('Validation Error')
    this.formErrors = error?.formErrors ?? []
    this.fieldErrors = error?.fieldErrors ?? {}
  }
}

export type ActionErrors<S extends StandardSchemaV1> =
  | ActionErrorKlass<S>
  | ServerErrorKlass

export type SuccessActionCallback<Data> = (args: { data: Data }) => void
export type ErrorActionCallback = (args: ServerErrorKlass) => void

export type ExecuteFn<S extends ActionSchema, Data> = (
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
  S extends ActionSchema = undefined,
  CVE extends ActionError<S> = ActionError<S>,
  Data = any,
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
  const router = useRouter()
  const { toast } = useToast()

  const successCb = useCallback(
    (args: OnSuccessArgs<ServerError, S, CVE, Data>) => {
      if (args.data === undefined) return

      // If is a redirect, it takes precendence over onSuccess callback
      if (isFrontendRedirect(args)) {
        router.push(args.data.frontendRedirect)
        return
      }

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
    [onSuccess, toast, router],
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
  const executeFn: ExecuteFn<S, Data> = useCallback(
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
