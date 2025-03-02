'use client'

import { use } from 'react'

import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useMcpServers from '$/stores/mcpServers'

export default function DestroyMcpApplication({
  params,
}: {
  params: Promise<{ mcpApplicationId: string }>
}) {
  const { mcpApplicationId } = use(params)
  const navigate = useNavigate()
  const { data, destroy } = useMcpServers()
  const mcpApplication = data.find((p) => p.id === Number(mcpApplicationId))

  if (!mcpApplication) return null

  return (
    <DestroyModal
      onOpenChange={(open) => !open && navigate.push(ROUTES.settings.root)}
      title='Remove MCP Server'
      description={`Are you sure you want to remove ${mcpApplication?.name} from this workspace? Any prompts or evaluations using this MCP server will be affected.`}
      action={() => destroy({ id: mcpApplication.id })}
      submitStr={`Remove ${mcpApplication?.name}`}
      model={mcpApplication}
      onSuccess={() => navigate.push(ROUTES.settings.root)}
    />
  )
}
