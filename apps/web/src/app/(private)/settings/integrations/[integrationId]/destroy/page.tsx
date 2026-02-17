'use client'

import { use, useEffect, useMemo } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import useIntegrations from '$/stores/integrations'
import useIntegrationReferences from '$/stores/integrationReferences'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useDocumentVersion from '$/stores/useDocumentVersion'
import Link from 'next/link'
import { IntegrationReference } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import useProjects from '$/stores/projects'
import { useCommitsFromProject } from '$/stores/commitsStore'
import { useProductAccess } from '$/components/Providers/SessionProvider'

type IntegrationReferenceGroup = {
  projectId: number
  documentUuid: string
  commitIds: number[]
}

function IntegrationReferences({
  referenceGroup,
}: {
  referenceGroup: IntegrationReferenceGroup
}) {
  const { data: projects } = useProjects()
  const { data: commits } = useCommitsFromProject(referenceGroup.projectId)

  const project = useMemo(() => {
    return projects?.find((p) => p.id === referenceGroup.projectId)
  }, [projects, referenceGroup.projectId])

  const commit = useMemo(() => {
    if (!commits) return undefined

    const referencedCommits = commits?.filter((c) =>
      referenceGroup.commitIds.includes(c.id),
    )

    const mergedReferenceCommit = referencedCommits?.find((c) => c.mergedAt)
    if (mergedReferenceCommit) return mergedReferenceCommit

    return referencedCommits?.[0]
  }, [commits, referenceGroup.commitIds])

  const { data: document } = useDocumentVersion({
    projectId: referenceGroup.projectId,
    documentUuid: referenceGroup.documentUuid,
    commitUuid: commit?.uuid ?? HEAD_COMMIT,
  })

  return (
    <Link
      href={
        commit
          ? ROUTES.projects
              .detail({ id: referenceGroup.projectId })
              .commits.detail({ uuid: commit.uuid }).home.root
          : '#'
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
  const { agentBuilder } = useProductAccess()
  const { data, destroy, isDestroying } = useIntegrations()
  const integration = data.find((p) => p.id === Number(integrationId))

  useEffect(() => {
    if (!agentBuilder) {
      navigate.push(ROUTES.dashboard.root)
    }
  }, [agentBuilder, navigate])

  const { data: references, isLoading } = useIntegrationReferences(integration)

  const groupedReferences = useMemo<IntegrationReferenceGroup[]>(() => {
    if (!references) return []

    const referencesByUuid = references.reduce(
      (acc, reference) => {
        if (!acc[reference.documentUuid]) acc[reference.documentUuid] = []
        acc[reference.documentUuid].push(reference)
        return acc
      },
      {} as Record<string, IntegrationReference[]>,
    )

    return Object.values(referencesByUuid).map((references) => ({
      projectId: references[0].projectId,
      documentUuid: references[0].documentUuid,
      commitIds: references.map((r) => r.commitId),
    }))
  }, [references])

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
            This integration is currently being used in{' '}
            {groupedReferences.length} prompts:
          </Text.H5>
          <div className='flex flex-col gap-2'>
            {groupedReferences.map((referenceGroup, idx) => {
              return (
                <IntegrationReferences
                  key={idx}
                  referenceGroup={referenceGroup}
                />
              )
            })}
          </div>
          <Text.H5>
            You must remove them all before deleting the integration.
          </Text.H5>
        </div>
      )}
    </DestroyModal>
  )
}
