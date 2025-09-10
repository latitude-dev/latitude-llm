'use server'

import {
  findProjectCached,
  getDocumentLogsApproximatedCountByProjectCached,
  getProjectStatsCached,
  hasDocumentLogsByProjectCached,
  isFeatureEnabledCached,
} from '$/app/(private)/_data-access'
import { AddPromptTextarea } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/overview/_components/Overview/AddPromptTextarea'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { LIMITED_VIEW_THRESHOLD } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { redirect } from 'next/navigation'
import ProjectLayout from '../_components/ProjectLayout'
import { DocumentBlankSlateLayout } from '../documents/_components/DocumentBlankSlateLayout'
import Overview from './_components/Overview'
import { AddFileButton } from './_components/Overview/AddFileButton'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Overview',
    locationDescription: 'Project General Overview',
  })
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId: projectIdString, commitUuid } = await params
  const projectId = Number(projectIdString)

  return redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid }).analytics.root,
  )
}
