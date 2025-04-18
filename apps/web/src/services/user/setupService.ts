import setupServiceFn from '@latitude-data/core/services/users/setupService'
import { env } from '@latitude-data/env'
import { captureException } from '$/helpers/captureException'

export default function setupService({
  email,
  name,
  companyName,
  importDefaultProject = true,
}: {
  email: string
  name: string
  companyName: string
  importDefaultProject?: boolean
}) {
  return setupServiceFn({
    email,
    name,
    companyName,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
    defaultProviderApiKey: env.DEFAULT_PROVIDER_API_KEY,
    captureException,
    importDefaultProject,
  })
}
