import { APICallError } from 'ai'

import { RunErrorCodes } from '../../constants'
import { Result } from '../../lib'
import { ChainError } from '../chains/ChainErrors'

export function handleAICallAPIError(e: unknown) {
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
