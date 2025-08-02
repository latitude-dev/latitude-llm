import {
  findProjectCached,
  getDocumentLogsApproximatedCountByProjectCached,
  getProjectStatsCached,
  hasDocumentLogsByProjectCached,
} from '$/app/(private)/_data-access'
import { AddPromptTextarea } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/overview/_components/Overview/AddPromptTextarea'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { LIMITED_VIEW_THRESHOLD } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import ProjectLayout from '../_components/ProjectLayout'
import { DocumentBlankSlateLayout } from '../documents/_components/DocumentBlankSlateLayout'
import Overview from '../overview/_components/Overview'
import { AddFileButton } from '../overview/_components/Overview/AddFileButton'

export const metadata = buildMetatags({
  locationDescription: 'Project Analytics Overview',
})

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId: projectIdString, commitUuid } = await params
  const projectId = Number(projectIdString)

  const session = await getCurrentUserOrRedirect()
  const project = await findProjectCached({
    projectId: projectId,
    workspaceId: session.workspace.id,
  })

  const hasLogs = await hasDocumentLogsByProjectCached(projectId)
  if (!hasLogs) {
    return (
      <ProjectLayout projectId={projectId} commitUuid={commitUuid}>
        <DocumentBlankSlateLayout
          title={project.name}
          description='To get started, please choose one of the following options.'
        >
          <AddFileButton />
          <Text.H5 color='foregroundMuted'>Or</Text.H5>
          <AddPromptTextarea />
        </DocumentBlankSlateLayout>
      </ProjectLayout>
    )
  }

  let limitedView = undefined
  const approximatedCount =
    await getDocumentLogsApproximatedCountByProjectCached(projectId)
  if (approximatedCount > LIMITED_VIEW_THRESHOLD) {
    limitedView = await getProjectStatsCached(projectId)
    if (!limitedView) {
      limitedView = {
        totalDocuments: 0,
        totalRuns: approximatedCount,
        totalTokens: 0,
        runsPerModel: {},
        costPerModel: {},
        rollingDocumentLogs: [],
        totalEvaluations: 0,
        totalEvaluationResults: 0,
        costPerEvaluation: {},
      }
    }
  }

  return (
    <ProjectLayout projectId={projectId} commitUuid={commitUuid}>
      <div className='min-h-full w-full p-6'>
        <TableWithHeader
          title='Analytics'
          table={<Overview project={project} limitedView={limitedView} />}
        />
      </div>
    </ProjectLayout>
  )
}
