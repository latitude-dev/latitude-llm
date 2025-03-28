import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import {
  inferServerActionError,
  inferServerActionReturnData,
  TAnyZodSafeFunctionHandler,
} from 'zsa'
import { useServerAction } from 'zsa-react'

export type ActionErrors<
  THook extends (...args: any[]) => any,
  TActionKey extends keyof ReturnType<THook>,
> = Awaited<ReturnType<ReturnType<THook>[TActionKey]>>[1] | null | undefined

export function parseActionErrors<
  THook extends (...args: any[]) => any,
  TActionKey extends keyof ReturnType<THook>,
>(errors: ActionErrors<THook, TActionKey>) {
  try {
    const issues: { path: string[]; message: string }[] =
      JSON.parse(errors?.data ?? '{}').issues ?? []

    return issues.reduce(
      (acc, issue) => {
        acc[issue.path.join('.')] = [
          ...(acc[issue.path.join('.')] ?? []),
          issue.message,
        ]
        return acc
      },
      {} as Record<string, string[]>,
    )
  } catch (error) {
    return {}
  }
}

export default function useLatitudeAction<
  const TServerAction extends TAnyZodSafeFunctionHandler,
>(
  action: TServerAction,
  {
    onSuccess,
    onError,
  }: {
    onSuccess?: (args: {
      data: inferServerActionReturnData<TServerAction>
    }) => void
    onError?: (args: { err: inferServerActionError<TServerAction> }) => void
  } = {},
) {
  const { toast } = useToast()
  const successCb = useCallback(
    onSuccess ||
      (() => {
        toast({
          title: 'Success',
          description: 'Action completed successfully',
        })
      }),
    [onSuccess],
  )
  const errorCb = useCallback(
    onError ||
      ((error: inferServerActionError<TServerAction>) => {
        if (error?.err?.code === 'INPUT_PARSE_ERROR') return

        toast({
          title: 'Error',
          description: error?.err?.message || error?.message,
          variant: 'destructive',
        })
      }),
    [onError],
  )

  return useServerAction(action, {
    onSuccess: successCb,
    onError: errorCb,
  })
}
