import { FocusLayout } from '$/components/layouts'
import { ROUTES } from '$/services/routes'
import { confirmMagicLinkToken } from '@latitude-data/core/services/magicLinkTokens/confirm'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import { redirect } from 'next/navigation'

export default async function ConfirmMagicLink({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  await confirmMagicLinkToken(token).then((r) => r.unwrap())

  setTimeout(() => {
    redirect(ROUTES.root)
  }, 5000)

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='You are in!'
          description='In a few seconds you will be redirected to your workspace.'
        />
      }
    />
  )
}
