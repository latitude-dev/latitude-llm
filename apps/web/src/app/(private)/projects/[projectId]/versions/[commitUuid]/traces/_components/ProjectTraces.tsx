'use client'

import { use, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentVersions from '$/stores/documentVersions'
import { UseSpansKeysetPaginationReturn } from '$/stores/spansKeysetPagination/types'
import { ProjectConversationRow } from './ProjectConversationRow'
import { TraceSpanSelectionStateContext } from '$/components/traces/TraceSpanSelectionContext'

export function ProjectTraces({
  traces,
}: {
  traces: UseSpansKeysetPaginationReturn
}) {
  const { selection } = use(TraceSpanSelectionStateContext)
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  const documentLabels = useMemo(
    () =>
      new Map(
        documents.map(
          (document) => [document.documentUuid, document.path] as const,
        ),
      ),
    [documents],
  )

  return (
    <Table
      className='table-auto'
      externalFooter={
        <SimpleKeysetTablePaginationFooter
          setNext={traces.goToNextPage}
          setPrev={traces.goToPrevPage}
          hasNext={traces.hasNext}
          hasPrev={traces.hasPrev}
          isLoading={traces.isLoading}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Document</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Evaluations</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {traces.items.map((span) => (
          <ProjectConversationRow
            key={span.documentLogUuid ?? span.id}
            span={span}
            documentLabel={
              (span.documentUuid
                ? documentLabels.get(span.documentUuid)
                : undefined) ??
              span.documentUuid ??
              '-'
            }
            isSelected={selection.documentLogUuid === span.documentLogUuid}
          />
        ))}
      </TableBody>
    </Table>
  )
}
