import { omit } from 'lodash-es'

import type { ProviderLog, ProviderLogDto } from '../../browser'
import { buildProviderLogResponse } from './buildResponse'

export default function providerLogPresenter(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),

    response: buildProviderLogResponse(providerLog),
  }
}
