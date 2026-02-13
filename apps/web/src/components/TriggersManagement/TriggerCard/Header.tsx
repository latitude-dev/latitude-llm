import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { useTriggerInfo } from '../hooks/useTriggerInfo'
import { ReactNode, useMemo } from 'react'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import { cn } from '@latitude-data/web-ui/utils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerStatus } from '@latitude-data/constants'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'

function HeaderWrapper({
  image,
  title,
  description,
  documentBadge,
  integrationBadge,
}: {
  image: ReactNode
  title: ReactNode
  description: ReactNode
  documentBadge: ReactNode
  integrationBadge?: ReactNode
}) {
  return (
    <div className='flex flex-row gap-4 min-w-0'>
      <div
        className={cn(
          'size-10 rounded-md bg-backgroundCode flex items-center justify-center overflow-hidden',
        )}
      >
        {image}
      </div>
      <div className='flex flex-col gap-1 min-w-0'>
        <div className='flex flex-col gap-0 min-w-0'>
          {title}
          {description}
        </div>
        {integrationBadge ?? null}
        {documentBadge}
      </div>
    </div>
  )
}

function LoadingTriggerHeader() {
  return (
    <HeaderWrapper
      image={<Skeleton className='w-6 h-6' />}
      title={<Skeleton height='h4' className='w-20' />}
      description={<Skeleton height='h5' className='w-40' />}
      documentBadge={<Skeleton height='h5' className='w-20' />}
    />
  )
}

function LoadedTriggerHeader({
  trigger,
  commit,
  document,
  integrations,
}: {
  trigger: DocumentTrigger
  commit: Commit
  document: DocumentVersion
  integrations: IntegrationDto[]
}) {
  const { image, title, description } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })

  const documentName = useMemo(() => {
    return (
      document?.path.split('/').pop() ?? document?.path ?? 'Unknown Document'
    )
  }, [document])

  return (
    <HeaderWrapper
      image={image}
      title={
        <Text.H4M ellipsis noWrap>
          {title}
        </Text.H4M>
      }
      description={
        trigger.triggerStatus === DocumentTriggerStatus.Pending ? (
          <Text.H5 color='latteOutputForeground' ellipsis noWrap>
            Requires additional configuration
          </Text.H5>
        ) : description ? (
          <Text.H5 color='foregroundMuted' ellipsis noWrap>
            {description}
          </Text.H5>
        ) : null
      }
      documentBadge={
        <div>
          <Link
            href={
              ROUTES.projects
                .detail({ id: commit.projectId })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: document.documentUuid }).root
            }
          >
            <Tooltip
              className='w-fit'
              trigger={
                <Badge
                  variant='accent'
                  iconProps={{ name: 'file', placement: 'start' }}
                  noWrap
                  ellipsis
                  className='w-fit'
                >
                  {documentName}
                </Badge>
              }
            >
              {document.path}
            </Tooltip>
          </Link>
        </div>
      }
    />
  )
}

export function TriggerHeader({
  trigger,
  commit,
}: {
  trigger: DocumentTrigger
  commit: Commit
}) {
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      projectId: trigger.projectId,
      commitUuid: commit.uuid,
    })

  const document = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === trigger.documentUuid),
    [documents, trigger.documentUuid],
  )

  const isLoading = isLoadingIntegrations || isLoadingDocuments

  if (isLoading || !document) return <LoadingTriggerHeader />
  return (
    <LoadedTriggerHeader
      trigger={trigger}
      commit={commit}
      document={document}
      integrations={integrations!}
    />
  )
}
