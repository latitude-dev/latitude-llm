import { DocumentTriggerType } from '@latitude-data/constants'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { LatteLayout } from '$/components/LatteLayout'
import { TriggersList } from './_components/TriggersList'
import {
  DocumentTriggersRepository,
  IntegrationsRepository,
} from '@latitude-data/core/repositories'
import { TriggersBlankSlate } from './_components/TriggersBlankSlate'

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { workspace } = await getCurrentUserOrRedirect()
  const { projectId } = await params
  const scope = new DocumentTriggersRepository(workspace.id)
  const integrationTriggers = await scope
    .findByProjectId(Number(projectId))
    .then((triggers) =>
      triggers.filter((t) => t.triggerType === DocumentTriggerType.Integration),
    )
  const integrationsScope = new IntegrationsRepository(workspace.id)
  const integrations = await integrationsScope
    .findAll()
    .then((r) => r.unwrap())
    .then((integrations) => integrations.filter((i) => i.type === 'pipedream'))

  return (
    <div className='flex-1 min-h-0'>
      <LatteLayout>
        <div className='flex flex-col h-full p-4'>
          {integrationTriggers.length > 0 ? (
            <TriggersList
              triggers={integrationTriggers}
              // @ts-expect-error - integrations is a union type but we are only passing pipedream type integrations
              integrations={integrations}
            />
          ) : (
            <TriggersBlankSlate />
          )}
        </div>
      </LatteLayout>
    </div>
  )
}
