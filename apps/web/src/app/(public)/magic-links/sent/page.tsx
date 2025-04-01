import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import buildMetatags from '$/app/_lib/buildMetatags'
import { FocusLayout } from '$/components/layouts'
import { ROUTES } from '$/services/routes'
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
      header={
        <FocusHeader
          title="You've got mail!"
          description={`We sent you a magic link to ${email}. Click the link to sign in.`}
        />
      }
    />
  )
}
