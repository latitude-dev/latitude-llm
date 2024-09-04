import { ReactNode } from 'react'

import { Container, Text } from '@latitude-data/web-ui'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import { NAV_LINKS } from '../_lib/constants'
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
  const sectionLinks = [
    { label: 'Projects', href: ROUTES.dashboard.root },
    { label: 'Evaluations', href: ROUTES.evaluations.root },
    { label: 'Settings', href: ROUTES.settings.root },
  ]

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
      sectionLinks={sectionLinks}
    >
      <Container>
        {children}
        <WorkspaceName />
        <ProviderApiKeys />
        <Memberships />
      </Container>
    </AppLayout>
  )
}
