import { env } from '@latitude-data/env'
import { jwtVerify, SignJWT } from 'jose'
import { Result } from '../lib/Result'
import { TOKEN_CONFIG, type TokenType, type WebSocketData } from './constants'

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
  const config = TOKEN_CONFIG[name]
  const secret = new TextEncoder().encode(SECRET_TOKENS[name])
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(config.maxAge.stringValue)
    .sign(secret)
  return {
    token,
    cookiesOptions: {
      secure: env.SECURE_WEBSOCKETS,
      domain: env.WEBSOCKETS_COOKIES_DOMAIN,
      path: env.WEBSOCKETS_COOKIES_PATH,
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

export async function generateWorkerWebsocketToken(expiration = '1h') {
  const secret = new TextEncoder().encode(env.WEBSOCKET_SECRET_TOKEN_KEY)
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiration)
    .sign(secret)

  return token
}

export async function verifyWorkerWebsocketToken(token: string) {
  try {
    const secret = new TextEncoder().encode(env.WEBSOCKET_SECRET_TOKEN_KEY)
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
