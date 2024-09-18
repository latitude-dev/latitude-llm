import { ReactNode } from 'react'

import { Container, Text, TitleWithActions } from '@latitude-data/web-ui'
import { AppTabs } from '$/app/(private)/AppTabs'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { NAV_LINKS } from '../_lib/constants'
import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceApiKeys from './_components/WorkspaceApiKeys'
import WorkspaceName from './_components/WorkspaceName'

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const session = await getCurrentUser()
  const breadcrumbs = [
    {
      name: session.workspace.name,
    },
    {
      name: <Text.H5M>Settings</Text.H5M>,
    },
  ]

  return (
    <AppLayout
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={breadcrumbs}
    >
      <Container>
        <AppTabs />
        {children}
        <TitleWithActions title='Workspace' />
        <WorkspaceName />
        <WorkspaceApiKeys />
        <ProviderApiKeys />
        <Memberships />
      </Container>
    </AppLayout>
  )
}
