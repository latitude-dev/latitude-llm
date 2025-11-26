import { Metadata } from 'next'
import NotificationsModal from '$/components/Notifications/Modal'
import { metadata as modalMetadata } from '../../notifications/page'
import { ROUTES } from '$/services/routes'

export const metadata: Promise<Metadata> = modalMetadata

export default function DashboardNotificationsPage() {
  return <NotificationsModal route={ROUTES.dashboard.root} />
}
