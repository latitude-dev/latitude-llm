import { ReactNode } from 'react'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { TableWithHeader, Text } from '@latitude-data/web-ui'
import BreadcrumpLink from '$/components/BreadcrumpLink'
import { Breadcrump } from '$/components/layouts/AppLayout/Header'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import { Actions } from './_components/Actions'

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
  return (
    <div className='w-full p-6'>
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
        table={<></>}
      />
    </div>
  )
}
