'use server'

import {
  findCommitCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { AgentPageWrapper } from './_components/AgentPageWrapper'

export default async function AgentPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params
  const commit = await findCommitCached({
    uuid: commitUuid,
    projectId: Number(projectId),
  })
  const documents = await getDocumentsAtCommitCached({ commit })

  return <AgentPageWrapper documents={documents} />
}
