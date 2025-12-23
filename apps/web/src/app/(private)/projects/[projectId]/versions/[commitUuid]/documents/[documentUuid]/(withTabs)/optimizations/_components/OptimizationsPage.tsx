'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataProvider } from '$/components/MetadataProvider'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { ROUTES } from '$/services/routes'
import { useOptimizations } from '$/stores/optimizations'
import { Pagination } from '@latitude-data/core/helpers'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useEffect, useRef, useState } from 'react'
import {
  OptimizationPanelContent,
  OptimizationPanelWrapper,
} from './OptimizationPanel'
import { OptimizationsActions } from './OptimizationsActions'
import { OptimizationsTable } from './OptimizationsTable'

export function OptimizationsPage({
  optimizations: serverOptimizations,
  selectedOptimization: serverSelectedOptimization,
  search: serverSearch,
}: {
  optimizations: OptimizationWithDetails[]
  selectedOptimization?: OptimizationWithDetails
  search: Required<Pagination>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [selectedOptimization, setSelectedOptimization] = useState(serverSelectedOptimization) // prettier-ignore
  const [search, setSearch] = useState(serverSearch)
  useEffect(() => setSearch(serverSearch), [serverSearch])
  useEffect(() => {
    const base = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid }).optimizations

    const targetUrl = selectedOptimization
      ? base.detail({ uuid: selectedOptimization.uuid, ...search }).root
      : base.root(search)

    if (targetUrl !== window.location.href) {
      window.history.replaceState(null, '', targetUrl)
    }
  }, [project, commit, document, selectedOptimization, search])

  const {
    data: optimizations,
    isLoading: isLoadingOptimizations,
    startOptimization,
    isStartingOptimization,
    cancelOptimization,
    isCancelingOptimization,
  } = useOptimizations(
    { project, document, search },
    { fallbackData: serverOptimizations, keepPreviousData: true },
  )

  // Note: prefetch next results
  useOptimizations({
    project: project,
    document: document,
    search: { ...search, page: search.page + 1 },
  })

  const [openStartModal, setOpenStartModal] = useState(false)

  const tableRef = useRef<HTMLTableElement>(null)
  const panelContainerRef = useRef<HTMLDivElement>(null)

  return (
    <MetadataProvider>
      <div className='w-full flex flex-col gap-4 p-6 flex-grow min-h-0'>
        <TableWithHeader
          title={
            <Text.H4M noWrap ellipsis>
              Optimizations
            </Text.H4M>
          }
          actions={
            <OptimizationsActions
              openStartModal={openStartModal}
              setOpenStartModal={setOpenStartModal}
              startOptimization={startOptimization}
              isStartingOptimization={isStartingOptimization}
            />
          }
        />
        <TableResizableLayout
          showRightPane={!!selectedOptimization}
          rightPaneRef={panelContainerRef}
          leftPane={
            <OptimizationsTable
              optimizations={optimizations}
              selectedOptimization={selectedOptimization}
              setSelectedOptimization={setSelectedOptimization}
              setOpenStartModal={setOpenStartModal}
              cancelOptimization={cancelOptimization}
              isCancelingOptimization={isCancelingOptimization}
              search={search}
              setSearch={setSearch}
              isLoading={isLoadingOptimizations}
              tableRef={tableRef}
            />
          }
          rightPane={
            !!selectedOptimization && (
              <OptimizationPanelWrapper
                panelContainerRef={panelContainerRef}
                tableRef={tableRef}
              >
                {({ ref }) => (
                  <OptimizationPanelContent
                    ref={ref}
                    optimization={selectedOptimization}
                  />
                )}
              </OptimizationPanelWrapper>
            )
          }
        />
      </div>
    </MetadataProvider>
  )
}
