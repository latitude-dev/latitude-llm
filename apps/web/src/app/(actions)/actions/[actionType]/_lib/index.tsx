'use client'

import { executeBackendAction as executeBackendLatitudeAction } from '$/actions/actions/execute'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useOnce } from '$/hooks/useMount'
import { useDeferredPlaygroundAction } from '$/hooks/usePlaygroundAction'
import {
  ActionBackendParameters,
  ActionFrontendParameters,
  ActionType,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { ActionFrontendSpecification } from './shared'
import { ACTION_SPECIFICATIONS } from './specifications'

export function ClientPage<T extends ActionType = ActionType>({
  type,
  parameters,
  user,
  workspace,
}: {
  type: T
  parameters: ActionBackendParameters<T>
  user: User
  workspace: Workspace
}) {
  const { execute: executeBackendAction } = useLatitudeAction(
    executeBackendLatitudeAction,
    { onSuccess: () => {}, onError: () => {} },
  )
  const { executeFrontendAction } = useFrontendAction({ user, workspace })

  const [ended, setEnded] = useState<boolean>()
  const [error, setError] = useState<Error>()
  useOnce(() =>
    setTimeout(async () => {
      try {
        const [result, error] = await executeBackendAction({ type, parameters })

        if (error) {
          setError(error)
        } else if (result) {
          await executeFrontendAction({
            type,
            parameters: result as ActionFrontendParameters<T>,
          })
        }
        setTimeout(() => setEnded(true), 5000)
      } catch (error) {
        setError(error as Error)
      }
    }, 1000),
  )

  return (
    <ClientOnly loader={<LoadingAction />}>
      {error ? (
        <FailedAction error={error} />
      ) : ended ? (
        <FailedAction error={new Error('Action did not redirect')} />
      ) : (
        <LoadingAction />
      )}
    </ClientOnly>
  )
}

function useFrontendAction({
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

function FailedAction({ error }: { error: Error }) {
  return (
    <>
      <div className='w-full h-full flex items-center justify-center gap-2'>
        <Text.H4B align='center' color='destructive'>
          Oh no... the action failed!
        </Text.H4B>
      </div>
      <Text.H5 align='center' color='foregroundMuted'>
        {error.message}
      </Text.H5>
    </>
  )
}

function LoadingAction() {
  return (
    <>
      <div className='w-full h-full flex items-center justify-center gap-2'>
        <Icon
          name='loader'
          color='foreground'
          className='flex-shrink-0 -mt-px animate-spin'
        />
        <Text.H4B align='center' color='foreground'>
          Executing action
        </Text.H4B>
      </div>
      <Text.H5 align='center' color='foregroundMuted'>
        You should be redirected shortly
      </Text.H5>
    </>
  )
}
