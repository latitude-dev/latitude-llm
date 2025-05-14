'use client'

import { useNavigate } from '$/hooks/useNavigate'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { TabSelector } from '@latitude-data/web-ui/molecules/TabSelector'
import { useSelectedLayoutSegment } from 'next/navigation'

const evaluationsV2Route = 'evaluations-v2' as DocumentRoutes.evaluationsV2

export function DocumentTabSelector({
  projectId,
  commitUuid,
  documentUuid,
}: {
  documentUuid: string
  projectId: string
  commitUuid: string
}) {
  const router = useNavigate()
  const selectedSegment = useSelectedLayoutSegment() as DocumentRoutes | null
  const baseRoute = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid })

  const options = {
    [DocumentRoutes.editor]: {
      label: 'Editor',
      value: DocumentRoutes.editor,
      route: baseRoute.root,
    },
    [DocumentRoutes.evaluationsV2]: {
      label: 'Evaluations',
      value: DocumentRoutes.evaluationsV2,
      route: baseRoute.evaluationsV2.root,
    },
    [DocumentRoutes.experiments]: {
      label: 'Experiments',
      value: DocumentRoutes.experiments,
      route: baseRoute.experiments.root,
    },
    [DocumentRoutes.logs]: {
      label: 'Logs',
      value: DocumentRoutes.logs,
      route: baseRoute.logs.root,
    },
  }

  return (
    <TabSelector
      options={Object.values(options)}
      selected={
        (selectedSegment === evaluationsV2Route
          ? DocumentRoutes.evaluationsV2
          : selectedSegment) ?? DocumentRoutes.editor
      }
      onSelect={(value) => router.push(options[value].route)}
    />
  )
}
