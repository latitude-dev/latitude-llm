import { ProviderLog, objectToString } from '../../browser'

export function buildProviderLogResponse(providerLog: ProviderLog) {
  return (
    providerLog.responseText ||
    (providerLog.responseObject
      ? objectToString(providerLog.responseObject)
      : '')
  )
}
