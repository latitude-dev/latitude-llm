'use client'

import { useState, useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { RunSourceGroup, SpanType } from '@latitude-data/constants'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { mapSourceGroupToLogSources } from '@latitude-data/core/services/runs/mapSourceGroupToLogSources'
import { IntegrationGalleryModal } from '$/components/IntegrationGallery'
import { InviteMembersModal } from '$/components/InviteMembersModal'
import useApiKeys from '$/stores/apiKeys'

export default function ProductionBanner({ project }: { project: Project }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const { data: apiKeys } = useApiKeys()
  const firstApiKey = apiKeys?.[0]

  const { items, isLoading } = useSpansKeysetPaginationStore(
    {
      projectId: project.id.toString(),
      types: [SpanType.Prompt, SpanType.External],
      source: mapSourceGroupToLogSources(RunSourceGroup.Production),
      limit: 1,
    },
    { revalidateOnFocus: false },
  )

  const hasProductionRuns = useMemo(() => items.length > 0, [items])

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
      <InviteMembersModal
        open={inviteModalOpen}
        setOpen={setInviteModalOpen}
      />
    </>
  )
}
