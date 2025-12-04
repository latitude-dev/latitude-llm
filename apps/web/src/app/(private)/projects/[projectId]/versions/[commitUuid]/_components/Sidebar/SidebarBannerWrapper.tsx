'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import useActiveDeploymentTest from '$/stores/useActiveDeploymentTest'
import OngoingAbTestBanner from './OngoingAbTestBanner'
import ProductionBanner from './ProductionBanner'

export default function SidebarBannerWrapper({
  project,
  commit,
  initialTest,
}: {
  project: Project
  commit: Commit
  initialTest: DeploymentTest | null
}) {
  const { data: activeTest } = useActiveDeploymentTest(
    {
      projectId: project.id,
      commitId: commit.id,
    },
    {
      fallbackData: initialTest,
    },
  )

  // Only show A/B test banner if it's an active A/B test
  const ongoingAbTest = activeTest?.testType === 'ab' ? activeTest : null
  console.log(activeTest)

  return ongoingAbTest ? (
    <OngoingAbTestBanner
      projectId={project.id}
      test={ongoingAbTest}
      commitUuid={commit.uuid}
    />
  ) : (
    <ProductionBanner project={project} />
  )
}
