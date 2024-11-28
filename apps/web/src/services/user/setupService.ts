import setupServiceFn from '@latitude-data/core/services/users/setupService'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'

export default function setupService({
  email,
  name,
  companyName,
}: {
  email: string
  name: string
  companyName: string
}) {
  return setupServiceFn({
    email,
    name,
    companyName,
    defaultProviderId: env.DEFAULT_PROVIDER_ID,
    defaultProviderApiKey: env.DEFAULT_PROVIDER_API_KEY,
    captureException,
  })
}
