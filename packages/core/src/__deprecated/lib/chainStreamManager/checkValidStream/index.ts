import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import { Result } from '../../../../lib/Result'

export function checkValidStream({ type }: { type: 'text' | 'object' }) {
  const invalidType = type !== 'text' && type !== 'object'
  if (!invalidType) return Result.nil()

  return Result.error(
    new ChainError({
      code: RunErrorCodes.UnsupportedProviderResponseTypeError,
      message: `Invalid stream type ${type} result is not a textStream or objectStream`,
    }),
  )
}
