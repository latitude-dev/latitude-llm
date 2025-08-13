'use client'

import { useOnce } from '$/hooks/useMount'
import { useDeferredPlaygroundAction } from '$/hooks/usePlaygroundAction'
import {
  ActionFrontendParameters,
  ActionType,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { FailedAction, LoadingAction } from '../_components'
import { ActionFrontendSpecification } from './shared'
import { ACTION_SPECIFICATIONS } from './specifications'

export function FrontendAction<T extends ActionType = ActionType>({
  type,
  parameters,
  user,
  workspace,
}: {
  type: T
  parameters: ActionFrontendParameters<T>
  user: User
  workspace: Workspace
}) {
  const { executeFrontendAction } = useFrontendAction({ user, workspace })

  const [result, setResult] = useState<boolean>()
  const [error, setError] = useState<Error>()
  useOnce(() =>
    setTimeout(async () => {
      try {
        await executeFrontendAction({ type, parameters })
        setTimeout(() => setResult(true), 5000)
      } catch (exception) {
        setError(exception as Error)
      }
    }, 1000),
  )

  return (
    <ClientOnly loader={<LoadingAction />}>
      {error ? (
        <FailedAction error={error} />
      ) : result ? (
        <FailedAction error={new Error('Action did not redirect')} />
      ) : (
        <LoadingAction />
      )}
    </ClientOnly>
  )
}

export function useFrontendAction({
  user,
  workspace,
}: {
  user: User
  workspace: Workspace
}) {
  const router = useRouter()
  const { setPlaygroundAction } = useDeferredPlaygroundAction()

  const executeFrontendAction = useCallback(
    async <T extends ActionType = ActionType>({
      type,
      parameters,
    }: {
      type: T
      parameters: ActionFrontendParameters<T>
    }) => {
      const specification = ACTION_SPECIFICATIONS[type] as unknown as ActionFrontendSpecification<T> // prettier-ignore
      if (!specification) {
        throw new Error('Invalid action type')
      }

      const parsing = specification.parameters.safeParse(parameters)
      if (parsing.error) {
        throw new Error('Invalid action parameters')
      }

      return await specification.execute({
        parameters: parameters,
        user: user,
        workspace: workspace,
        router: router,
        setPlaygroundAction: setPlaygroundAction,
      })
    },
    [router, setPlaygroundAction, user, workspace],
  )

  return { executeFrontendAction }
}
