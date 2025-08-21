import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError } from 'ai'

import { Result } from '../../lib/Result'
import { isAbortError } from '../../lib/isAbortError'

export function handleAICallAPIError(e: unknown) {
  // Handle abort errors by returning them directly without converting to ChainError
  if (isAbortError(e)) {
    throw e
  }

  const isApiError = APICallError.isInstance(e)
  return Result.error(
    new ChainError({
      code: RunErrorCodes.AIRunError,
      message: isApiError
        ? `Error: ${e.message} and response body: ${e.responseBody}`
        : e instanceof Error
          ? `Unknown error: ${e.message}`
          : `Unknown error: ${e}`,
    }),
  )
}
