import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

// TODO: remove after 2 weeks the migration to datasets V2 is finished
export default async function RedirectToNewModalPage() {
  return redirect(ROUTES.datasets.root({ modal: 'new' }))
}
