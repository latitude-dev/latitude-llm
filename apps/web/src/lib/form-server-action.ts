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
  /**
   * Reset the form to its mount-time defaults after a successful submit.
   * Defaults to `true`. Set to `false` for in-place edit forms where the
   * just-submitted value should become the new baseline (a `reset()` would
   * snap the field back to the stale mount-time default and the input would
   * appear to "revert").
   */
  resetOnSuccess?: boolean
}

type SetFieldMeta = (field: string, updater: (prev: { errorMap: Record<string, unknown> }) => unknown) => void

/**
 * Creates an onSubmit handler that calls a server function and handles Zod validation errors.
 *
 * - On success: optionally resets form (see `resetOnSuccess`), calls onSuccess callback
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
  const resetOnSuccess = options.resetOnSuccess ?? true

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
      if (resetOnSuccess) formApi.reset()
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
