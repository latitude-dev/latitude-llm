import { env } from '@latitude-data/env'

import ConfirmMagicLink from './ConfirmMagicLink'

export default function ConfirmMagicLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  return (
    <ConfirmMagicLink
      params={params}
      searchParams={searchParams}
      isCloud={!!env.LATITUDE_CLOUD}
    />
  )
}
