'use client'

import NewMcpServer from '$/app/(private)/settings/_components/McpServers/New'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export default function NewMcpApplicationPage() {
  const navigate = useNavigate()

  return (
    <NewMcpServer
      open
      setOpen={(open) => !open && navigate.push(ROUTES.settings.root)}
    />
  )
}
