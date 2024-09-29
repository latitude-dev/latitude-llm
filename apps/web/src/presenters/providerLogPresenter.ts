import { omit } from 'lodash-es'

import type { ProviderLog, ProviderLogDto } from '@latitude-data/core/browser'
import { buildProviderLogResponse } from '@latitude-data/core/services/providerLogs/buildResponse'

export default function providerLogPresenter(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),
    response: buildProviderLogResponse(providerLog),
  }
}
