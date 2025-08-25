'use client'

import { use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'

export default function DestroyProject({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)
  const navigate = useNavigate()
  const { data, destroy } = useProjects()
  const project = data.find((p) => p.id === Number(projectId))

  if (!project) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.dashboard.root)}
      title='Remove Project'
      description='Are you sure you want to remove this project? You will be able to recover it later on.'
      submitStr={`Remove ${project?.name}`}
      action={destroy}
      model={project}
      onSuccess={() => navigate.push(ROUTES.dashboard.root)}
    />
  )
}
