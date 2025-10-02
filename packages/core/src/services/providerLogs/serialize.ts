import { omit } from 'lodash-es'

import { ProviderLog, ProviderLogDto } from '../../schema/types'
import { buildProviderLogResponse } from './buildResponse'

export default function serializeProviderLog(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),

    response: buildProviderLogResponse(providerLog),
  }
}
