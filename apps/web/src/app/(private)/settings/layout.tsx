import { ReactNode } from 'react'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TitleWithActions } from '@latitude-data/web-ui/molecules/TitleWithActions'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'

import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceApiKeys from './_components/WorkspaceApiKeys'
import WorkspaceName from './_components/WorkspaceName'
import Integrations from './_components/Integrations'
import Webhooks from './_components/Webhooks'
import Promocodes from './_components/Promocodes'

export const metadata = buildMetatags({
  title: 'Settings',
  locationDescription: 'Settings Page',
})

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
      <Memberships />
      <WorkspaceApiKeys />
      <ProviderApiKeys />
      <Promocodes />
      <Integrations />
      <Webhooks />
    </Container>
  )
}
