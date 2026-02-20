import { Metadata } from 'next'
import {
  findProjectCached,
  getEvaluationV2AtCommitByDocumentCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { findOrCreateMainDocumentCached } from '$/lib/dualScope/findOrCreateMainDocumentCached'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { EvaluationEditor } from '../../../versions/[commitUuid]/documents/[documentUuid]/(withTabs)/evaluations/[evaluationUuid]/editor/_components/EvaluationEditor'
import buildMetatags from '$/app/_lib/buildMetatags'
import {
  EvaluationType,
  LlmEvaluationMetric,
} from '@latitude-data/core/constants'

export const metadata: Promise<Metadata> = buildMetatags({
  locationDescription: 'Project Evaluation Editor',
})

export default async function ProjectEvaluationEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    evaluationUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId: pjid, evaluationUuid } = await params
  const projectId = Number(pjid)
  const queryParams = await searchParams

  const { workspace } = await getCurrentUserOrRedirect()
  const project = await findProjectCached({
    projectId,
    workspaceId: workspace.id,
  })

  const { commit, document } = await findOrCreateMainDocumentCached({
    project,
  })
  const providerApiKeys = await getProviderApiKeysCached()
  const evaluation = await getEvaluationV2AtCommitByDocumentCached({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    evaluationUuid,
  })

  const hasEditor =
    evaluation.type == EvaluationType.Llm &&
    evaluation.metric.startsWith(LlmEvaluationMetric.Custom)

  if (!hasEditor) {
    return redirect(
      ROUTES.projects
        .detail({ id: projectId })
        .evaluations.detail({ uuid: evaluationUuid }).root,
    )
  }

  const selectedSpanId = queryParams.spanId
  const selectedDocumentLogUuid = queryParams.documentLogUuid
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <EvaluationEditor
      document={document}
      commit={commit}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      selectedSpanId={selectedSpanId as string | undefined}
      selectedDocumentLogUuid={selectedDocumentLogUuid as string | undefined}
      copilotEnabled={env.LATITUDE_CLOUD}
    />
  )
}
