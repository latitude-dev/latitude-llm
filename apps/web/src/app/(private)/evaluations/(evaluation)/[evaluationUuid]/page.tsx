import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function DocumentPage({
  params: { evaluationUuid },
}: {
  params: { evaluationUuid: string }
}) {
  redirect(ROUTES.evaluations.detail({ uuid: evaluationUuid }).dashboard.root)
}
