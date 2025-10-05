import { APICallError } from 'ai'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { OnErrorParameters } from '../../../services/ai'

function getErrorMessage(error: APICallError) {
  const message = error.responseBody ?? 'An error occurred during AI call'
  if (!error.data) return message
  if (typeof error.data !== 'object') return message
  if (!('error' in error.data)) return message
  if (!error.data.error) return message
  if (typeof error.data.error !== 'object') return message
  if (!('message' in error.data.error)) return message
  if (typeof error.data.error.message !== 'string') return message
  return error.data.error.message
}

export function handleAIError({ error: rawError }: OnErrorParameters) {
  let aiResultError:
    | ChainError<RunErrorCodes.Unknown | RunErrorCodes.AIRunError>
    | undefined = undefined

  if (APICallError.isInstance(rawError)) {
    const message = getErrorMessage(rawError)
    aiResultError = new ChainError({
      code: RunErrorCodes.AIRunError,
      message,
    })
  } else if (rawError instanceof Error) {
    aiResultError = new ChainError({
      code: RunErrorCodes.AIRunError,
      message: rawError.message,
    })
  } else {
    aiResultError = new ChainError({
      code: RunErrorCodes.Unknown,
      message: 'An unknown error occurred during AI call',
    })
  }
  throw aiResultError
}
