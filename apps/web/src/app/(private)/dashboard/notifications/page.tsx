import { Metadata } from 'next'
import { Container } from '@latitude-data/web-ui/atoms/Container'
import { TitleWithActions } from '@latitude-data/web-ui/molecules/TitleWithActions'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'
import Notifications from '$/components/Notifications'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Notifications',
  locationDescription: 'Email Notifications',
})

export default function DashboardNotificationsPage() {
  return (
    <Container>
      <AppTabs />
      <TitleWithActions title='Email Notifications' />
      <Notifications />
    </Container>
  )
}
