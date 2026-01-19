import { ChainError, NotFoundError, RunErrorCodes } from './errors'

export function isRetryableError(error: unknown) {
  return (
    error instanceof NotFoundError ||
    (error instanceof ChainError && error.errorCode === RunErrorCodes.RateLimit)
  )
}
