import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

/**
 * We only throw an error if is not a known run error.
 *
 *  1. Is a ChainError of type `unknown`. This is the catch in `runChain` not knowing what happened.
 *  2. is not a `ChainError` so it means something exploded.
 */
export function getUnknownError(error: Error | unknown | undefined) {
  const isAllGood =
    !error || (error instanceof ChainError && error.errorCode !== RunErrorCodes.Unknown)

  if (isAllGood) return null

  return error as Error
}
