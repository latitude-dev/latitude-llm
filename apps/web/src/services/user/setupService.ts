import setupServiceFn from '@latitude-data/core/services/users/setupService'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'
import { UserTitle } from '@latitude-data/constants/users'

export default function setupService({
  email,
  name,
  companyName,
  source,
  title,
}: {
  email: string
  name: string
  companyName: string
  source?: string
  title?: UserTitle
}) {
  return setupServiceFn({
    email,
    name,
    companyName,
    source,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    defaultProviderApiKey: env.DEFAULT_PROVIDER_API_KEY,
    captureException,
    title,
  })
}
