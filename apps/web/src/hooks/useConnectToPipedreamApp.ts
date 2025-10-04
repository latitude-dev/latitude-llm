import { createPipedreamTokenAction } from '$/actions/integrations/pipedream/createToken'
import { useCallback, useMemo, useState } from 'react'
import { useServerAction } from 'zsa-react'
import { createFrontendClient, type App } from '@pipedream/sdk/browser'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import type { TokenCallback } from 'node_modules/@pipedream/sdk/dist/esm/core/index.mjs'

export function useConnectToPipedreamApp(app: App | undefined) {
  const { data: workspace } = useCurrentWorkspace()

  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionId, setConnectionId] = useState<string | undefined>(
    undefined,
  )

  const { execute: generateToken } = useServerAction(createPipedreamTokenAction)

  const tokenCallback = useCallback<TokenCallback>(async () => {
    const [data, error] = await generateToken()
    if (error) throw error

    return {
      token: data.token,
      expiresAt: new Date(data.expiresAt),
      connectLinkUrl: '', // Uses the default Pipedream connect link
    }
  }, [generateToken])

  const connect = useCallback((): Promise<
    [string, undefined] | [undefined, Error]
  > => {
    if (!workspace) {
      return Promise.resolve([
        undefined,
        new Error('Something went wrong, please try again.'),
      ])
    }

    if (!app) {
      return Promise.resolve([undefined, new Error('App is not selected')])
    }

    setIsConnecting(true)

    let resolve: (_: [string, undefined] | [undefined, Error]) => void
    const promise = new Promise<[string, undefined] | [undefined, Error]>(
      (res) => {
        resolve = res
      },
    )

    const pipedream = createFrontendClient({
      externalUserId: String(workspace.id),
      tokenCallback,
    })

    pipedream.connectAccount({
      app: app.nameSlug,
      onSuccess: (account) => {
        setIsConnecting(false)
        setConnectionId(account.id)
        resolve([account.id, undefined])
      },
      onError: (error) => {
        setIsConnecting(false)
        resolve([undefined, error])
      },
      onClose: () => {
        setIsConnecting(false)
        resolve([undefined, new Error('The connection process was cancelled')])
      },
    })

    return promise
  }, [app, workspace, tokenCallback])

  return useMemo(
    () => ({
      connect,
      isLoading: isConnecting,
      connectionId,
    }),
    [connect, isConnecting, connectionId],
  )
}
