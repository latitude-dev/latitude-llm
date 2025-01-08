import { RunErrorCodes } from '@latitude-data/constants/errors'

import { StreamType } from '../../../constants'
import { Result } from '../../../lib'
import { AIReturn } from '../../ai'
import { ChainError } from '../ChainErrors'

export function checkValidStream({ type }: AIReturn<StreamType>) {
  const invalidType = type !== 'text' && type !== 'object'
  if (!invalidType) return Result.nil()

  return Result.error(
    new ChainError({
      code: RunErrorCodes.UnsupportedProviderResponseTypeError,
      message: `Invalid stream type ${type} result is not a textStream or objectStream`,
    }),
  )
}
