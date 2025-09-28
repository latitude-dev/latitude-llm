import { RunErrorCodes } from '@latitude-data/constants/errors'

import { ErrorableEntity } from '../../constants'
import { createRunError as createRunErrorService } from '../../services/runErrors/create'

interface CreateRunErrorProps {
  errorableType: ErrorableEntity
  errorableUuid: string
  code: RunErrorCodes
  message: string
  details?: object
}

export async function createRunError({
  errorableType,
  errorableUuid,
  code,
  message,
  details,
}: CreateRunErrorProps) {
  return createRunErrorService({
    data: {
      errorableType,
      errorableUuid,
      code,
      message,
      // @ts-expect-error - mock
      details: details ?? { errorCode: code },
    },
  }).then((r) => r.unwrap())
}
