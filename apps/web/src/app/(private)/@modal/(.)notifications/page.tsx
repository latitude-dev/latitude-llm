import { Metadata } from 'next'
import buildMetatags from '$/app/_lib/buildMetatags'
import NotificationsModal from '$/components/Notifications/Modal'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Notifications',
  locationDescription: 'Email Notifications',
})

export default function NotificationsModalPage() {
  return <NotificationsModal />
}
