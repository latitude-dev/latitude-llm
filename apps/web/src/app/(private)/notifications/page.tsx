import { Metadata } from 'next'
import buildMetatags from '$/app/_lib/buildMetatags'

import Notifications from '$/components/Notifications'
import { FocusLayout } from '$/components/layouts'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Notifications',
  locationDescription: 'Email Notifications',
})

export default function NotificationsPage() {
  return (
    <FocusLayout>
      <Notifications />
    </FocusLayout>
  )
}
