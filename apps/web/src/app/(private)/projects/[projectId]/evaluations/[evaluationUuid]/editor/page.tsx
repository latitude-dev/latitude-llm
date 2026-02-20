import { Metadata } from 'next'
import {
  findCommitsByProjectCached,
  findProjectCached,
  getEvaluationV2AtCommitByDocumentCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import { providerApiKeyPresenter } from '@latitude-data/core/services/providerApiKeys/helpers/presenter'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { getOrCreateProjectMainDocument } from '@latitude-data/core/services/documents/getOrCreateProjectMainDocument'
import { env } from '@latitude-data/env'
import { notFound, redirect } from 'next/navigation'
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

  const session = await getCurrentUserOrRedirect()
  if (!session.workspace || !session.user) return redirect(ROUTES.root)

  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })

  const commits = await findCommitsByProjectCached({ projectId: project.id })
  const commit = commits[0]
  if (!commit) return notFound()

  const mainDocResult = await getOrCreateProjectMainDocument({
    workspace: session.workspace,
    user: session.user,
    commit,
  })
  if (mainDocResult.error) {
    throw mainDocResult.error
  }
  const document = mainDocResult.value

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
  const freeRunsCount = await getFreeRuns(session.workspace.id)

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
