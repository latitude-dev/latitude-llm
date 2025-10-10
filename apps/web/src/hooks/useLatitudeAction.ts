import { isFrontendRedirect } from '$/lib/frontendRedirect'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { FlattenedValidationErrors, ValidationErrors } from 'next-safe-action'
import {
  HookCallbacks,
  HookSafeActionFn,
  useAction,
} from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

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

const humanizeField = (str: string) => {
  return str
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^./, (match) => match.toUpperCase())
    .trim()
}

const ZOD_REQUIRED_ERROR_PATTERN =
  /Invalid input: expected (.*), received undefined/

function humanizeError(key: string, error: string) {
  const field = humanizeField(key)

  if (ZOD_REQUIRED_ERROR_PATTERN.test(error)) {
    if (field) return `${field} is required`
    return 'Required'
  }

  return error
}

export function buildActionError<S extends StandardSchemaV1>({
  validationErrors,
  serverError,
}: {
  validationErrors?: ActionError<S>
  serverError?: unknown
}) {
  if (validationErrors) {
    validationErrors.formErrors = (validationErrors.formErrors || []).map(
      (error) => humanizeError('', error),
    )
    validationErrors.fieldErrors = Object.entries(
      (validationErrors.fieldErrors || {}) as Record<string, string[]>,
    ).reduce(
      (acc, [field, errors]) => {
        acc[field] = errors.map((error) => humanizeError(field, error))
        return acc
      },
      {} as Record<string, string[]>,
    )

    return new ActionErrorKlass<S>(validationErrors)
  }

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

  // Note: We don't pass callbacks to useAction since we use executeAsync
  // and manually trigger them. executeAsync bypasses useAction's callback system.
  const action = useAction(serverAction)
  const executeFn: ExecuteFn<S, Data> = useCallback(
    async (input: InferInputOrDefault<S, void>) => {
      const result = await action.executeAsync(input)

      if (result.serverError || result.validationErrors) {
        // Manually trigger error callback since executeAsync doesn't trigger it
        if (errorCb && result.serverError) {
          errorCb({
            error: {
              serverError: result.serverError,
              validationErrors: result.validationErrors,
            },
          } as any)
        }
        return [
          null,
          buildActionError({
            validationErrors: result.validationErrors,
            serverError: result.serverError,
          }),
        ] as const
      }

      // Manually trigger success callback since executeAsync doesn't trigger it
      if (successCb && result.data !== undefined) {
        successCb({
          data: result.data,
          input: input as InferInputOrDefault<S, undefined>,
        })
      }
      return [result.data!, null] as const
    },
    [action, successCb, errorCb],
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
