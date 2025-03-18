import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

// TODO: remove after 2 weeks the migration to datasets V2 is finished
export default async function RedirectToGenerateModalPage({
  searchParams,
}: {
  searchParams: Promise<{
    parameters?: string
    name?: string
    backUrl?: string
  }>
}) {
  const { parameters, name, backUrl } = await searchParams

  return redirect(
    ROUTES.datasets.root({ modal: 'generate', name, parameters, backUrl }),
  )
}
