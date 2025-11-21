import { ReactNode } from 'react'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TitleWithActions } from '@latitude-data/web-ui/molecules/TitleWithActions'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'

import Notifications from '../settings/_components/Notifications'

export const metadata = buildMetatags({
  title: 'Notifications',
  locationDescription: 'Notifications Page',
})

export default async function NotificationsPage() {
  return (
    <Container>
      <AppTabs />
      <TitleWithActions title='Email Notifications' />
      <Notifications />
    </Container>
  )
}
