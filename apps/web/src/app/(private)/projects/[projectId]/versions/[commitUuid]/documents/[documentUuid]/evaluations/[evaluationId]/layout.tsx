import { ReactNode } from 'react'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { computeEvaluationResultsWithMetadata } from '@latitude-data/core/services/evaluationResults/computeEvaluationResultsWithMetadata'
import { TableWithHeader, Text } from '@latitude-data/web-ui'
import { findCommitCached } from '$/app/(private)/_data-access'
import BreadcrumpLink from '$/components/BreadcrumpLink'
import { Breadcrump } from '$/components/layouts/AppLayout/Header'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { Actions } from './_components/Actions'
import { EvaluationResults } from './_components/EvaluationResults'
import { MetricsSummary } from './_components/MetricsSummary'

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
  }).then((r) => r.unwrap())

  return (
    <div className='flex flex-col w-full h-full gap-6 p-6 custom-scrollbar'>
      {children}
      <TableWithHeader
        title={
          <Breadcrump
            breadcrumbs={[
              {
                name: (
                  <BreadcrumpLink
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
              { name: <Text.H5M>{evaluation.name}</Text.H5M> },
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
        documentUuid={params.documentUuid}
        evaluation={evaluation}
        evaluationResults={evaluationResults}
      />
      <EvaluationResults
        evaluation={evaluation}
        evaluationResults={evaluationResults}
      />
    </div>
  )
}
