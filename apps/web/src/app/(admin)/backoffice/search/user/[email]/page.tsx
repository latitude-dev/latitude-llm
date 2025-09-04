import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { findUserByEmailForAdmin } from '$/data-access'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { UserDashboard } from './_components/UserDashboard'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  params: Promise<{ email: string }>
}

export default async function UserInfoPage({ params }: Props) {
  const { user } = await getCurrentUserOrRedirect()
  if (!user?.admin) {
    return notFound()
  }

  const { email } = await params
  const decodedEmail = decodeURIComponent(email)

  const result = await findUserByEmailForAdmin({
    userId: user.id,
    email: decodedEmail,
  })

  if (result.error) {
    return (
      <div className='container mx-auto p-6 max-w-4xl'>
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <div className='flex flex-col gap-2'>
              <Text.H1>User Not Found</Text.H1>
              <Text.H5 color='foregroundMuted'>
                No user found with email: {decodedEmail}
              </Text.H5>
            </div>
            <Link href={ROUTES.backoffice[BackofficeRoutes.search].root}>
              <Button fancy variant='outline'>
                <Text.H5 noWrap>← Back to Search</Text.H5>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <UserDashboard user={result.value} />
}
