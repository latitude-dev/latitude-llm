import { ReactNode } from 'react'
import { Metadata } from 'next'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TitleWithActions } from '@latitude-data/web-ui/molecules/TitleWithActions'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'
import { getProductAccess } from '$/services/productAccess/getProductAccess'

import Memberships from './_components/Memberships'
import ProviderApiKeys from './_components/ProviderApiKeys'
import WorkspaceApiKeys from './_components/WorkspaceApiKeys'
import WorkspaceName from './_components/WorkspaceName'
import Integrations from './_components/Integrations'
import Webhooks from './_components/Webhooks'
import Promocodes from './_components/Promocodes'
import { CustomerPortalButton } from './_components/CustomerPortalButton'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Settings',
  locationDescription: 'Settings Page',
})

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const productAccess = await getProductAccess()

  return (
    <Container>
      <AppTabs />
      {children}
      <TitleWithActions title='Workspace' actions={<CustomerPortalButton />} />
      <WorkspaceName />
      <Memberships />
      <WorkspaceApiKeys />
      <ProviderApiKeys />
      {productAccess.agentBuilder && <Integrations />}
      <Webhooks />
      <Promocodes />
    </Container>
  )
}
