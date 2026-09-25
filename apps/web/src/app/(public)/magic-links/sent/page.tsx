import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import buildMetatags from '$/app/_lib/buildMetatags'
import { FocusLayout } from '$/components/layouts'
import { ShutdownBanner } from '$/components/ShutdownBanner'
import { ROUTES } from '$/services/routes'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'

export const metadata = buildMetatags({
  title: 'Login to your account',
})

export default async function MagicLinkSent({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  if (!email) return redirect(ROUTES.root)

  return (
    <FocusLayout
      banner={env.LATITUDE_CLOUD ? <ShutdownBanner /> : null}
      header={
        <FocusHeader
          title="You've got mail!"
          description={`If an account exists for ${email}, we sent it a magic link. Click the link to sign in.`}
        />
      }
    />
  )
}
