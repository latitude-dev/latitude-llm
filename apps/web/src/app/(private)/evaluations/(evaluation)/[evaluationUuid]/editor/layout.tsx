import { ReactNode } from 'react'

import {
  getEvaluationByUuidCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { EvaluationMetadataType } from '@latitude-data/core/browser'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { redirect } from 'next/navigation'

import EvaluationEditorLayout from './_components/EvaluationEditorLayout'

export default async function DocumentPage({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ evaluationUuid: string }>
}) {
  const { workspace } = await getCurrentUser()
  const evaluationUuid = (await params).evaluationUuid
  const evaluation = await getEvaluationByUuidCached(evaluationUuid)
  const providerApiKeys = await getProviderApiKeysCached()
  const freeRunsCount = await getFreeRuns(workspace.id)

  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return redirect(ROUTES.dashboard.root)
  }

  return (
    <EvaluationEditorLayout
      evaluation={evaluation}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
    >
      {children}
    </EvaluationEditorLayout>
  )
}
