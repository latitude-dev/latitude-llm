import { ReactNode } from 'react'

import { Container, Text, TitleWithActions } from '@latitude-data/web-ui'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { MAIN_NAV_LINKS, NAV_LINKS } from '../_lib/constants'
import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceName from './_components/WorkspaceName'

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const data = await getSession()
  if (!data.session) return redirect(ROUTES.auth.login)

  const { workspace, user } = await getCurrentUser()
  const breadcrumbs = [
    {
      name: <Text.H5M>{workspace.name}</Text.H5M>,
    },
  ]

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={{ ...user }}
      breadcrumbs={breadcrumbs}
      sectionLinks={MAIN_NAV_LINKS}
    >
      <Container>
        {children}
        <TitleWithActions title='Workspace' />
        <WorkspaceName />
        <ProviderApiKeys />
        <Memberships />
      </Container>
    </AppLayout>
  )
}
