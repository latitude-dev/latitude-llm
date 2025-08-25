import { createPipedreamTokenAction } from '$/actions/integrations/pipedream/createToken'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useServerAction } from 'zsa-react'
import { createFrontendClient, type App } from '@pipedream/sdk/browser'

export function useConnectToPipedreamApp(app: App | undefined) {
  const [token, setToken] = useState<string | undefined>(undefined)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | undefined>(undefined)

  const [isConnecting, setIsConnecting] = useState(false)
  const [externalUserId, setExternalUserId] = useState<string | undefined>(undefined)
  const [connectionId, setConnectionId] = useState<string | undefined>(undefined)

  const { execute: generateToken } = useServerAction(createPipedreamTokenAction, {
    onSuccess: ({ data }) => {
      setToken(data.token)
      setExternalUserId(data.externalUserId)
      setTokenExpiresAt(new Date(data.expiresAt))
    },
  })

  useEffect(() => {
    // Keeps regenerating the token when it expires
    const timeToExpire = tokenExpiresAt ? tokenExpiresAt.getTime() - Date.now() : 0

    const timeoutId = setTimeout(generateToken, timeToExpire)
    return () => {
      clearTimeout(timeoutId)
    }
  }, [tokenExpiresAt, generateToken])

  const connect = useCallback((): Promise<[string, undefined] | [undefined, Error]> => {
    if (!app) {
      return Promise.resolve([undefined, new Error('App is not selected')])
    }

    if (!token || !tokenExpiresAt || tokenExpiresAt < new Date()) {
      return Promise.resolve([undefined, new Error('Invalid token')])
    }

    setIsConnecting(true)

    let resolve: (_: [string, undefined] | [undefined, Error]) => void
    const promise = new Promise<[string, undefined] | [undefined, Error]>((res) => {
      resolve = res
    })

    const pipedream = createFrontendClient()
    pipedream.connectAccount({
      app: app.name_slug,
      token: token,
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
  }, [app, token, tokenExpiresAt])

  return useMemo(
    () => ({
      connect,
      isLoading: !token || isConnecting,
      connectionId,
      externalUserId,
    }),
    [connect, isConnecting, token, connectionId, externalUserId],
  )
}
