import crypto from 'crypto'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'
import { UnauthorizedError } from './../../../lib/errors'

type VerifyWebhookSignatureOptions = {
  maxTimestampAge: number
}

export function verifyWebhookSignature(
  {
    signingKey,
    timestamp,
    token,
    signature,
  }: {
    signingKey: string
    timestamp?: string
    token?: string
    signature?: string
  },
  options: VerifyWebhookSignatureOptions = {
    maxTimestampAge: 300, // 300 seconds = 5 minutes
  },
): TypedResult<undefined, UnauthorizedError> {
  if (!timestamp || !token || !signature) {
    return Result.error(new UnauthorizedError('Missing signature'))
  }

  const now = Math.floor(Date.now() / 1000)
  const timeDiff = now - parseInt(timestamp, 10)
  if (timeDiff > options.maxTimestampAge) {
    return Result.error(new UnauthorizedError('Webhook signature expired'))
  }

  const encodedToken = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp.concat(token))
    .digest('hex')

  if (encodedToken === signature) {
    return Result.nil()
  }

  return Result.error(new UnauthorizedError('Invalid webhook signature'))
}
