import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ evaluationUuid: string }>
}) {
  const { evaluationUuid } = await params
  redirect(ROUTES.evaluations.detail({ uuid: evaluationUuid }).dashboard.root)
}
