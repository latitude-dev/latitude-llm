import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function AppRoot() {
  redirect(ROUTES.dashboard.root)
}
