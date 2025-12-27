'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataProvider } from '$/components/MetadataProvider'
import { useOptimizations } from '$/stores/optimizations'
import { Pagination } from '@latitude-data/core/helpers'
import { type Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useState } from 'react'
import { OptimizationsActions } from './OptimizationsActions'
import { OptimizationsTable } from './OptimizationsTable'

export function OptimizationsPage({
  optimizations: serverOptimizations,
  search: serverSearch,
}: {
  optimizations: Optimization[]
  search: Required<Pagination>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const [openStartModal, setOpenStartModal] = useState(false)

  const [search, setSearch] = useState(serverSearch)
  const {
    data: optimizations,
    startOptimization,
    isStartingOptimization,
    cancelOptimization,
    isCancelingOptimization,
  } = useOptimizations(
    { project, commit, document, search },
    { fallbackData: serverOptimizations, keepPreviousData: true },
  )
  // Note: prefetch next results
  useOptimizations({
    project: project,
    commit: commit,
    document: document,
    search: { ...search, page: search.page + 1 },
  })

  return (
    <MetadataProvider>
      <div className='w-full flex flex-col gap-4 p-6'>
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
        <OptimizationsTable
          optimizations={optimizations}
          setOpenStartModal={setOpenStartModal}
          cancelOptimization={cancelOptimization}
          isCancelingOptimization={isCancelingOptimization}
          search={search}
          setSearch={setSearch}
        />
      </div>
    </MetadataProvider>
  )
}
