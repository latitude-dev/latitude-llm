import { ProviderLog } from '../../browser'

export function buildProviderLogResponse(providerLog: ProviderLog) {
  return (
    providerLog.responseText ||
    (providerLog.responseObject
      ? JSON.stringify(providerLog.responseObject)
      : '')
  )
}
