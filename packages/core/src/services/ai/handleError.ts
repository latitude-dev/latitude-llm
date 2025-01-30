import { RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError } from 'ai'

import { Result } from '../../lib'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'

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
