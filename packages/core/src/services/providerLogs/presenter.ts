import { omit } from 'lodash-es'

import { buildProviderLogResponse } from '@latitude-data/core/services/providerLogs/buildResponse'
import { ProviderLog, ProviderLogDto } from '../../browser'

export default function providerLogPresenter(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),

    response: buildProviderLogResponse(providerLog),
  }
}
