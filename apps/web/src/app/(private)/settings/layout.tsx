import { ReactNode } from 'react'

import { Container, TitleWithActions } from '@latitude-data/web-ui'
import { AppTabs } from '$/app/(private)/AppTabs'

import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceApiKeys from './_components/WorkspaceApiKeys'
import WorkspaceName from './_components/WorkspaceName'

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <Container>
      <AppTabs />
      {children}
      <TitleWithActions title='Workspace' />
      <WorkspaceName />
      <WorkspaceApiKeys />
      <ProviderApiKeys />
      <Memberships />
    </Container>
  )
}
