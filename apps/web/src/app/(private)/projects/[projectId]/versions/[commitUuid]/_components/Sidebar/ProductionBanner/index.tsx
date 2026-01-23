'use client'

import { useState, useCallback } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { IntegrationGalleryModal } from '$/components/IntegrationGallery'
import { InviteMembersModal } from '$/components/InviteMembersModal'
import useApiKeys from '$/stores/apiKeys'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import useSWR from 'swr'

type HasProductionSpansResponse = { hasProductionSpans: boolean }

export default function ProductionBanner({ project }: { project: Project }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const { data: apiKeys } = useApiKeys()
  const firstApiKey = apiKeys?.[0]

  const fetcher = useFetcher<HasProductionSpansResponse>(
    API_ROUTES.spans.hasProductionSpans.root,
    { searchParams: { projectId: String(project.id) } },
  )
  const { data, isLoading } = useSWR<HasProductionSpansResponse>(
    ['hasProductionSpans', project.id],
    fetcher,
    { revalidateOnFocus: false },
  )

  const hasProductionRuns = data?.hasProductionSpans ?? false

  const handleClick = useCallback(() => {
    setModalOpen(true)
  }, [])

  const handleInviteDevelopers = useCallback(() => {
    setModalOpen(false)
    setInviteModalOpen(true)
  }, [])

  if (isLoading || hasProductionRuns) return null

  return (
    <>
      <div
        onClick={handleClick}
        className='flex flex-col gap-y-1 bg-accent border border-accent-foreground/10 rounded-xl p-4 cursor-pointer hover:bg-accent/80 transition-colors'
      >
        <Text.H5M color='accentForeground'>Integrate in production →</Text.H5M>
        <Text.H5 color='accentForeground'>
          This project has no production traces yet, integrate our SDK in 1
          minute to see real data
        </Text.H5>
      </div>
      <IntegrationGalleryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workspaceApiKey={firstApiKey?.token}
        projectId={project.id}
        onInviteDevelopers={handleInviteDevelopers}
      />
      <InviteMembersModal open={inviteModalOpen} setOpen={setInviteModalOpen} />
    </>
  )
}
