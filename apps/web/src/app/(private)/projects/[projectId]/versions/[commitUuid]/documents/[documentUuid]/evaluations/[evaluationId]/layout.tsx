import { ReactNode } from 'react'

import {
  Commit,
  Evaluation,
  EvaluationAggregationTotals,
  EvaluationMeanValue,
  EvaluationModalValue,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import {
  getEvaluationMeanValueQuery,
  getEvaluationModalValueQuery,
  getEvaluationTotalsQuery,
} from '@latitude-data/core/services/evaluationResults/index'
import { Icon, TableWithHeader, Text, Tooltip } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { Breadcrumb } from '$/components/layouts/AppLayout/Header'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { Actions } from './_components/Actions'
import { EvaluationResults } from './_components/EvaluationResults'
import { MetricsSummary } from './_components/MetricsSummary'

const TYPE_TEXT: Record<EvaluationResultableType, string> = {
  [EvaluationResultableType.Text]: 'Text',
  [EvaluationResultableType.Number]: 'Numerical',
  [EvaluationResultableType.Boolean]: 'Boolean',
}

type ReturnType<T extends boolean> = T extends true
  ? {
      aggregationTotals: EvaluationAggregationTotals
      meanOrModal: EvaluationMeanValue
    }
  : {
      aggregationTotals: EvaluationAggregationTotals
      meanOrModal: EvaluationModalValue
    }
async function fetchData<T extends boolean>({
  workspaceId,
  evaluation,
  documentUuid,
  isNumeric,
  commit,
}: {
  isNumeric: T
  workspaceId: number
  evaluation: Evaluation
  documentUuid: string
  commit: Commit
}): Promise<ReturnType<T>> {
  const aggregationTotals = await getEvaluationTotalsQuery({
    workspaceId,
    commit,
    evaluation,
    documentUuid,
  })

  if (isNumeric) {
    const mean = await getEvaluationMeanValueQuery({
      workspaceId,
      evaluation,
      documentUuid,
      commit,
    })
    return { aggregationTotals, meanOrModal: mean } as ReturnType<T>
  }

  const modal = await getEvaluationModalValueQuery({
    workspaceId,
    evaluation,
    documentUuid,
    commit,
  })
  return { aggregationTotals, meanOrModal: modal } as ReturnType<T>
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
  const { workspace } = await getCurrentUser()
  const evaluationScope = new EvaluationsRepository(workspace.id)
  const evaluation = await evaluationScope
    .find(params.evaluationId)
    .then((r) => r.unwrap())

  const commit = await findCommitCached({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })

  const evaluationResults = await computeEvaluationResultsWithMetadata({
    workspaceId: evaluation.workspaceId,
    evaluation,
    documentUuid: params.documentUuid,
    draft: commit,
    limit: 1000,
  }).then((r) => r.unwrap())
  const isNumeric =
    evaluation.configuration.type == EvaluationResultableType.Number
  const data = await fetchData({
    workspaceId: workspace.id,
    evaluation,
    documentUuid: params.documentUuid,
    isNumeric,
    commit,
  })

  return (
    <div className='flex flex-col w-full h-full gap-6 p-6 custom-scrollbar'>
      {children}
      <TableWithHeader
        title={
          <Breadcrumb
            breadcrumbs={[
              {
                name: (
                  <BreadcrumbLink
                    showBackIcon
                    name='Evaluations'
                    href={
                      ROUTES.projects
                        .detail({ id: Number(params.projectId) })
                        .commits.detail({ uuid: params.commitUuid })
                        .documents.detail({ uuid: params.documentUuid })
                        .evaluations.root
                    }
                  />
                ),
              },
              {
                name: (
                  <div className='flex flex-row items-center gap-4'>
                    <Text.H4M>{evaluation.name}</Text.H4M>
                    <Text.H4M color='foregroundMuted'>
                      {TYPE_TEXT[evaluation.configuration.type]}
                    </Text.H4M>
                    <Tooltip
                      asChild
                      trigger={
                        <Link
                          href={
                            ROUTES.evaluations.detail({ uuid: evaluation.uuid })
                              .root
                          }
                        >
                          <Icon name='externalLink' />
                        </Link>
                      }
                    >
                      Go to evaluation
                    </Tooltip>
                  </div>
                ),
              },
            ]}
          />
        }
        actions={
          <Actions
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
        aggregationTotals={data.aggregationTotals}
        isNumeric={isNumeric}
        meanOrModal={data.meanOrModal}
      />
      <EvaluationResults
        evaluation={evaluation}
        evaluationResults={evaluationResults}
      />
    </div>
  )
}
