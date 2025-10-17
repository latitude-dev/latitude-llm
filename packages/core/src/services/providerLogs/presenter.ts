import { omit } from 'lodash-es'

import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { ProviderLogDto } from '../../schema/types'
import { buildProviderLogResponse } from './buildResponse'

export default function providerLogPresenter(
  providerLog: ProviderLog,
): ProviderLogDto {
  return {
    ...omit(providerLog, 'responseText', 'responseObject'),

    response: buildProviderLogResponse(providerLog),
  }
}
