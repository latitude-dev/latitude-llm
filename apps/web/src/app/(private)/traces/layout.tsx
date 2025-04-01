import { ReactNode } from 'react'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'

export const metadata = buildMetatags({
  title: 'Settings',
})

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <Container size='2xl'>
      <AppTabs />
      {children}
    </Container>
  )
}
