import { ReactNode } from 'react'

import { readMetadata } from '@latitude-data/compiler'
import { EvaluationResultableType } from '@latitude-data/core/browser'
import { env } from '@latitude-data/env'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbSeparator,
  Icon,
  TableWithHeader,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import {
  findCommitCached,
  getProviderApiKeyCached,
} from '$/app/(private)/_data-access'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { Actions } from './_components/Actions'
import { MetricsSummary } from './_components/MetricsSummary'
import { fetchEvaluationCached } from './_lib/fetchEvaluationCached'

const TYPE_TEXT: Record<EvaluationResultableType, string> = {
  [EvaluationResultableType.Text]: 'Text',
  [EvaluationResultableType.Number]: 'Numerical',
  [EvaluationResultableType.Boolean]: 'Boolean',
}

export default async function ConnectedEvaluationLayout({
  params,
  children,
}: {
  children: ReactNode
  params: {
    projectId: string
    commitUuid: string
    documentUuid: string
    evaluationId: string
  }
}) {
  const evaluation = await fetchEvaluationCached(Number(params.evaluationId))
  const commit = await findCommitCached({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })
  const isNumeric =
    evaluation.metadata.configuration.type == EvaluationResultableType.Number

  let provider
  if (evaluation.metadata.prompt) {
    const metadata = await readMetadata({
      prompt: evaluation.metadata.prompt,
    })

    if (
      metadata.config.provider &&
      typeof metadata.config.provider === 'string'
    ) {
      try {
        provider = await getProviderApiKeyCached(metadata.config.provider)
      } catch (error) {
        // do nothing, it could be that the provider name does not match any
        // provider in the workspace
      }
    }
  }
  return (
    <div className='flex flex-col w-full h-full gap-6 p-6'>
      <TableWithHeader
        title={
          <Breadcrumb>
            <BreadcrumbItem noShrink>
              <BreadcrumbLink
                showBackIcon
                name='Evaluations'
                href={
                  ROUTES.projects
                    .detail({ id: Number(params.projectId) })
                    .commits.detail({ uuid: params.commitUuid })
                    .documents.detail({ uuid: params.documentUuid }).evaluations
                    .root
                }
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Text.H4M noWrap ellipsis>
                {evaluation.name}
              </Text.H4M>
              <Text.H4M color='foregroundMuted'>
                {TYPE_TEXT[evaluation.metadata.configuration.type]}
              </Text.H4M>
              <Tooltip
                asChild
                trigger={
                  <Link
                    href={`${ROUTES.evaluations.detail({ uuid: evaluation.uuid }).editor.root}?back=${
                      ROUTES.projects
                        .detail({ id: Number(params.projectId) })
                        .commits.detail({ uuid: params.commitUuid })
                        .documents.detail({ uuid: params.documentUuid })
                        .evaluations.detail(evaluation.id).root
                    }`}
                  >
                    <Icon name='externalLink' />
                  </Link>
                }
              >
                Go to evaluation
              </Tooltip>
            </BreadcrumbItem>
          </Breadcrumb>
        }
        actions={
          <Actions
            isUsingDefaultProvider={
              provider && provider.token === env.DEFAULT_PROVIDER_API_KEY
            }
            evaluation={evaluation}
            projectId={params.projectId}
            commitUuid={params.commitUuid}
            documentUuid={params.documentUuid}
          />
        }
      />
      <MetricsSummary
        commit={commit}
        evaluation={evaluation}
        documentUuid={params.documentUuid}
        isNumeric={isNumeric}
      />
      {children}
    </div>
  )
}
