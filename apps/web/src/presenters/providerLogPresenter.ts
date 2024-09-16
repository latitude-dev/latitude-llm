import { omit } from 'lodash-es'

import type { ProviderLog, ProviderLogDto } from '@latitude-data/core/browser'

export default function providerLogPresenter(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),
    response:
      providerLog.responseText ||
      (providerLog.responseObject
        ? JSON.stringify(providerLog.responseObject)
        : ''),
  }
}
