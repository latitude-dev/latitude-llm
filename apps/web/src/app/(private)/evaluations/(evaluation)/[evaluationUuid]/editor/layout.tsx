import { ReactNode } from 'react'

import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import {
  getEvaluationByUuidCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

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
  const providerApiKeys = await getProviderApiKeysCached()
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <EvaluationEditorLayout
      evaluation={evaluation}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      evaluationUuid={evaluationUuid}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
    >
      {children}
    </EvaluationEditorLayout>
  )
}
