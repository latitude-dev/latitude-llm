import { extractFieldErrors } from "./errors.ts"

/**
 * Maps TanStack Form `field.state.meta.errors` to `@repo/ui` `Input` / `Textarea` `errors`:
 * `string[]` when non-empty, otherwise `undefined` (no error UI).
 */
export function fieldErrorsAsStrings(errors: readonly unknown[]): string[] | undefined {
  if (errors.length === 0) return undefined

  return errors.map(String)
}

interface ServerSubmitOptions<TResult> {
  onSuccess?: (result: TResult) => void | Promise<void>
  onError?: (error: unknown) => void
}

type SetFieldMeta = (field: string, updater: (prev: { errorMap: Record<string, unknown> }) => unknown) => void

/**
 * Creates an onSubmit handler that calls a server function and handles Zod validation errors.
 *
 * - On success: resets form, calls onSuccess callback
 * - On Zod validation error: sets field errors via formApi.setFieldMeta
 * - On other errors: calls onError callback
 *
 * Tracks previously errored fields and clears them on next submit attempt.
 */
export function createFormSubmitHandler<TFormValues, TResult>(
  action: (value: TFormValues) => Promise<TResult>,
  options: ServerSubmitOptions<TResult> = {},
): (params: {
  value: TFormValues
  formApi: { reset: () => void; setFieldMeta: (field: never, updater: never) => void }
}) => Promise<void> {
  let previouslyErroredFields: string[] = []

  return async ({ value, formApi }) => {
    const setFieldMeta = formApi.setFieldMeta as SetFieldMeta

    for (const field of previouslyErroredFields) {
      setFieldMeta(field, (prev) => ({
        ...prev,
        errorMap: { ...prev.errorMap, onSubmit: undefined },
      }))
    }
    previouslyErroredFields = []

    try {
      const result = await action(value)
      formApi.reset()
      await options.onSuccess?.(result)
    } catch (error) {
      const fieldErrors = extractFieldErrors(error)
      if (fieldErrors) {
        previouslyErroredFields = Object.keys(fieldErrors)
        for (const [field, messages] of Object.entries(fieldErrors)) {
          setFieldMeta(field, (prev) => ({
            ...prev,
            errorMap: { ...prev.errorMap, onSubmit: messages[0] },
          }))
        }
        return
      }
      options.onError?.(error)
    }
  }
}
