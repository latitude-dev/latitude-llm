import { objectToString } from '@latitude-data/constants'

export function buildProviderLogResponse(providerLog: {
  responseText: string | null | undefined
  responseObject: unknown
}) {
  return (
    providerLog.responseText ||
    (providerLog.responseObject
      ? objectToString(providerLog.responseObject)
      : '')
  )
}
