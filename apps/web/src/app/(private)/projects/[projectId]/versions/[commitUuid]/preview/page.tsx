'use server'

import { isFeatureEnabledCached } from '$/app/(private)/_data-access'
import { LatteLayout } from '$/components/LatteLayout'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import {
  CommitsRepository,
  DocumentTriggersRepository,
  IntegrationsRepository,
} from '@latitude-data/core/repositories'
import { redirect } from 'next/navigation'
import { TriggersList } from './_components/TriggersList'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId: _projectId, commitUuid } = await params
  const projectId = Number(_projectId)

  const latteEnabled = await isFeatureEnabledCached('latte')
  if (!latteEnabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid }).overview.root,
    )
  }

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

  return (
    <LatteLayout>
      <TriggersList
        triggers={integrationTriggers}
        integrations={integrations}
      />
    </LatteLayout>
  )
}
