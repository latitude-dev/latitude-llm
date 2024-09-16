import { env } from '@latitude-data/env'
import { jwtVerify, SignJWT } from 'jose'

import { Result } from '../lib'
import { TOKEN_CONFIG, TokenType, WebSocketData } from './constants'

const SECRET_TOKENS: Record<TokenType, string> = {
  websocket: env.WEBSOCKET_SECRET_TOKEN_KEY,
  websocketRefresh: env.WEBSOCKET_REFRESH_SECRET_TOKEN_KEY,
}
export async function generateWebsocketToken({
  name,
  payload,
}: {
  name: TokenType
  payload: WebSocketData
}) {
  const isProd = env.NODE_ENV === 'production'
  const config = TOKEN_CONFIG[name]
  const secret = new TextEncoder().encode(SECRET_TOKENS[name])
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(config.maxAge.stringValue)
    .sign(secret)
  return {
    token,
    cookiesOptions: {
      secure: isProd,
      domain: isProd ? `.${env.LATITUDE_DOMAIN}` : 'localhost',
      path: '/',
      maxAge: config.maxAge.numberValue,
    },
  }
}

export async function verifyWebsocketToken({
  token,
  type,
}: {
  token: string | undefined
  type: TokenType
}) {
  if (!token) return Result.error(new Error('No token provided'))

  try {
    const secret = new TextEncoder().encode(SECRET_TOKENS[type])
    const { payload } = await jwtVerify<WebSocketData>(token, secret)

    return Result.ok({ payload })
  } catch (err) {
    const error = err as Error
    return Result.error(error)
  }
}

export async function generateWorkerWebsocketToken() {
  const secret = new TextEncoder().encode(env.WORKERS_WEBSOCKET_SECRET_TOKEN)
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret)

  return token
}

export async function verifyWorkerWebsocketToken(token: string) {
  try {
    const secret = new TextEncoder().encode(env.WORKERS_WEBSOCKET_SECRET_TOKEN)
    const { payload } = await jwtVerify<{}>(token, secret)

    return Result.ok({ payload })
  } catch (err) {
    const error = err as Error
    return Result.error(error)
  }
}

export function buildWorkspaceRoom({ workspaceId }: { workspaceId: number }) {
  return `workspace:${workspaceId}`
}

export { TOKEN_CONFIG }
