import {
  findCommitCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getProductAccess } from '$/services/productAccess/getProductAccess'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { AgentPageWrapper } from './_components/AgentPageWrapper'

export default async function AgentPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const productAccess = await getProductAccess()
  const awaitedParams = await params
  const id = Number(awaitedParams.projectId)
  if (!productAccess.agentBuilder) {
    redirect(ROUTES.projects.detail({ id }).root)
  }

  const { projectId, commitUuid } = await params
  const commit = await findCommitCached({
    uuid: commitUuid,
    projectId: Number(projectId),
  })
  const documents = await getDocumentsAtCommitCached({ commit })

  return <AgentPageWrapper documents={documents} />
}
