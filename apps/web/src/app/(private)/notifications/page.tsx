import { Metadata } from 'next'
import { Container } from '@latitude-data/web-ui/atoms/Container'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'

import Notifications from '../settings/_components/Notifications'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Notifications',
  locationDescription: 'Notifications Page',
})

export default async function NotificationsPage() {
  return (
    <Container>
      <AppTabs />
      <Notifications />
    </Container>
  )
}
