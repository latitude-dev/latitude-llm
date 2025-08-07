'use client'

import { use, useMemo } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useIntegrationReferences from '$/stores/integrationReferences'
import useIntegrations from '$/stores/integrations'
import useProjects from '$/stores/projects'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { HEAD_COMMIT, IntegrationReference } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'

function ReferenceItem({ reference }: { reference: IntegrationReference }) {
  const { data: document } = useDocumentVersion(reference.documentUuid)
  const { data: projects } = useProjects()
  const project = useMemo(() => {
    return projects.find((p) => p.id === reference.projectId)
  }, [projects, reference.projectId])

  return (
    <Link
      href={
        ROUTES.projects
          .detail({ id: reference.projectId })
          .commits.detail({ uuid: HEAD_COMMIT })
          .documents.detail({ uuid: reference.documentUuid }).root
      }
      className='flex flex-row items-center justify-between gap-2 p-4 bg-secondary rounded-md hover:bg-accent'
      target='_blank'
      rel='noopener noreferrer'
    >
      <div className='flex flex-row items-center gap-2 overflow-hidden truncate'>
        <Icon name='file' />
        {project ? (
          <Text.H6 noWrap ellipsis>
            {project.name}
          </Text.H6>
        ) : (
          <Skeleton className='w-32' height='h6' />
        )}
        <Text.H6 color='foregroundMuted'>|</Text.H6>
        {document ? (
          <Text.H6 noWrap ellipsis>
            {document.path}
          </Text.H6>
        ) : (
          <Skeleton className='w-32' height='h6' />
        )}
      </div>
      <Icon name='externalLink' />
    </Link>
  )
}

export default function DestroyIntegration({
  params,
}: {
  params: Promise<{ integrationId: string }>
}) {
  const { integrationId } = use(params)
  const navigate = useNavigate()
  const { data, destroy, isDestroying } = useIntegrations()
  const integration = data.find((p) => p.id === Number(integrationId))

  const { data: references, isLoading } = useIntegrationReferences(integration)

  if (!integration) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      isDestroying={isDestroying}
      title='Remove Integration'
      description={`Are you sure you want to remove ${integration?.name} from this workspace? Any prompts or evaluations using this integration will be affected.`}
      action={() => destroy({ id: integration.id })}
      submitStr={`Remove ${integration?.name}`}
      model={integration}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
      disabled={isLoading || references.length > 0}
    >
      {references.length > 0 && (
        <div className='flex flex-col gap-4'>
          <Text.H5>
            This integration is currently being used in {references.length}{' '}
            prompts:
          </Text.H5>
          <div className='flex flex-col gap-2'>
            {references.map((reference, idx) => (
              <ReferenceItem key={idx} reference={reference} />
            ))}
          </div>
          <Text.H5>
            You must remove them all before deleting the integration.
          </Text.H5>
        </div>
      )}
    </DestroyModal>
  )
}
