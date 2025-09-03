import { BackofficeRoutes, ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  redirect(ROUTES.backoffice[BackofficeRoutes.search].root)
}
