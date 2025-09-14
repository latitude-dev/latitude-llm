'use server'

import { LatteLayout } from '$/components/LatteLayout'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  CommitsRepository,
  DocumentTriggersRepository,
  IntegrationsRepository,
} from '@latitude-data/core/repositories'
import { TriggersList } from './_components/TriggersList'
import { getLastLatteThreadUuidCached } from '$/app/(private)/_data-access'
import { findLatteThreadProviderLog } from '@latitude-data/core/services/providerLogs/findLatteThreadProviderLog'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId: _projectId, commitUuid } = await params
  const projectId = Number(_projectId)
  const commitsScope = new CommitsRepository(workspace.id)
  const commit = await commitsScope
    .getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    .then((r) => r.unwrap())

  const triggersScope = new DocumentTriggersRepository(workspace.id)
  const integrationTriggers = await triggersScope
    .getTriggersInProject({
      projectId: Number(projectId),
      commit,
    })
    .then((r) => r.unwrap())

  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations = await integrationsScope
    .findAll()
    .then((r) => r.unwrap())
    .then((integrations) => integrations.filter((i) => i.type === 'pipedream'))
  const lastThreadUuid = await getLastLatteThreadUuidCached({ projectId })
  const initialProviderLog = await findLatteThreadProviderLog({
    lastThreadUuid,
  })

  return (
    <LatteLayout
      initialThreadUuid={lastThreadUuid}
      initialProviderLog={initialProviderLog}
    >
      <TriggersList
        triggers={integrationTriggers}
        integrations={integrations}
      />
    </LatteLayout>
  )
}
