import { ReactNode } from 'react'

import {
  findCommitCached,
  getProviderApiKeyByIdCached,
  getProviderApiKeyByNameCached,
} from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import { readMetadata } from '@latitude-data/compiler'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { env } from '@latitude-data/env'
import {
  Breadcrumb,
  BreadcrumbItem,
} from '@latitude-data/web-ui/molecules/Breadcrumb'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'
import { scan } from 'promptl-ai'

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
  params: Promise<{
    evaluationId: string
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { evaluationId, projectId, commitUuid, documentUuid } = await params
  const evaluation = await fetchEvaluationCached(Number(evaluationId))
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })

  let provider
  if (evaluation.metadataType == EvaluationMetadataType.LlmAsJudgeAdvanced) {
    const metadata =
      evaluation.metadata.promptlVersion === 0
        ? await readMetadata({
            prompt: evaluation.metadata.prompt,
          })
        : await scan({
            prompt: evaluation.metadata.prompt,
          })

    if (
      metadata.config.provider &&
      typeof metadata.config.provider === 'string'
    ) {
      try {
        provider = await getProviderApiKeyByNameCached(metadata.config.provider)
      } catch (error) {
        // do nothing, it could be that the provider name does not match any
        // provider in the workspace
      }
    }
  } else if (
    evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeSimple
  ) {
    try {
      provider = await getProviderApiKeyByIdCached(
        evaluation.metadata.providerApiKeyId,
      )
    } catch (error) {
      // do nothing
    }
  }

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full gap-6 p-6'>
      <TableWithHeader
        title={
          <Breadcrumb>
            <BreadcrumbItem>
              <Text.H4M noWrap ellipsis>
                {evaluation.name}
              </Text.H4M>
              <div className='flex flex-row items-center gap-x-2'>
                <Text.H4M color='foregroundMuted'>
                  {TYPE_TEXT[evaluation.resultType]}
                </Text.H4M>

                {evaluation.metadataType !== EvaluationMetadataType.Manual && (
                  <Tooltip
                    asChild
                    trigger={
                      <Link
                        href={`${
                          ROUTES.evaluations.detail({ uuid: evaluation.uuid })
                            .editor.root
                        }?back=${
                          ROUTES.projects
                            .detail({ id: Number(projectId) })
                            .commits.detail({ uuid: commitUuid })
                            .documents.detail({ uuid: documentUuid })
                            .evaluations.detail(evaluation.id).root
                        }`}
                      >
                        <Icon name='externalLink' color='foregroundMuted' />
                      </Link>
                    }
                  >
                    Go to evaluation
                  </Tooltip>
                )}
              </div>
              <ClickToCopyUuid uuid={evaluation.uuid} />
            </BreadcrumbItem>
          </Breadcrumb>
        }
        actions={
          evaluation.metadataType !== EvaluationMetadataType.Manual && (
            <Actions
              isUsingDefaultProvider={
                provider && provider.token === env.DEFAULT_PROVIDER_API_KEY
              }
              evaluation={evaluation}
              projectId={projectId}
              commitUuid={commitUuid}
              documentUuid={documentUuid}
            />
          )
        }
      />
      <MetricsSummary
        commit={commit}
        evaluation={evaluation}
        documentUuid={documentUuid}
      />
      {children}
    </div>
  )
}
