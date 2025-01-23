import { objectToString } from '@latitude-data/constants'
import { ProviderLog } from '../../browser'

export function buildProviderLogResponse(providerLog: ProviderLog) {
  return (
    providerLog.responseText ||
    (providerLog.responseObject
      ? objectToString(providerLog.responseObject)
      : '')
  )
}
