import { RunErrorCodes } from '../constants'
import { isChainError } from '../services/chains/ChainStreamConsumer'

/**
 * We only throw an error if is not a known run error.
 *
 *  1. Is a ChainError of type `unknown`. This is the catch in `runChain` not knowing what happened.
 *  2. is not a `ChainError` so it means something exploded.
 */
export function getUnknownError(error: Error | unknown | undefined) {
  const isAllGood =
    !error || (isChainError(error) && error.errorCode !== RunErrorCodes.Unknown)

  if (isAllGood) return null

  return error as Error
}
