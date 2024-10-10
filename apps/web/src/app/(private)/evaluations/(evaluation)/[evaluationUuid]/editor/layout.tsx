import { ReactNode } from 'react'

import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { Text } from '@latitude-data/web-ui'
import {
  getEvaluationByUuidCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { AppLayout } from '$/components/layouts'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'

import EvaluationEditorLayout from './_components/EvaluationEditorLayout'

export default async function DocumentPage({
  children,
  params,
}: {
  children: ReactNode
  params: { evaluationUuid: string }
}) {
  const { workspace } = await getCurrentUser()
  const evaluationUuid = params.evaluationUuid
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)
  const session = await getCurrentUser()
  const providerApiKeys = await getProviderApiKeysCached()
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <AppLayout
      scrollable={false}
      navigationLinks={NAV_LINKS}
      currentUser={session.user}
      breadcrumbs={[
        {
          name: session.workspace.name,
        },
        {
          name: (
            <BreadcrumbLink href={ROUTES.evaluations.root} name='Evaluations' />
          ),
        },
        {
          name: <Text.H5M>{evaluation.name}</Text.H5M>,
        },
      ]}
    >
      <EvaluationEditorLayout
        evaluation={evaluation}
        providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
        evaluationUuid={evaluationUuid}
        freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      >
        {children}
      </EvaluationEditorLayout>
    </AppLayout>
  )
}
