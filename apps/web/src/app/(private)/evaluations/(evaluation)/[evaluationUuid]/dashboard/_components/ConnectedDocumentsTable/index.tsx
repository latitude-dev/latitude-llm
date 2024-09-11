'use client'

import { useMemo } from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'
import type { ConnectedDocumentWithMetadata } from '@latitude-data/core/repositories'
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatCostInMillicents'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useProjects from '$/stores/projects'

const ConnectedDocumentTableRow = ({
  document,
  onSelect,
}: {
  document: ConnectedDocumentWithMetadata
  onSelect: () => void
}) => {
  const { data: projects, isLoading: isProjectsLoading } = useProjects()
  const projectName = useMemo(() => {
    if (isProjectsLoading) return null

    return projects?.find((project) => project.id === document.projectId)?.name
  }, [document.projectId, isProjectsLoading, projects])

  const promptPath = useMemo(() => {
    return document.path.split('/').slice(0, -1).join('/')
  }, [document.path])

  const promptName = useMemo(() => {
    return document.path.split('/').pop()
  }, [document.path])

  const modalValuePercentage = useMemo(() => {
    return ((100 * document.modalValueCount) / document.evaluationLogs).toFixed(
      2,
    )
  }, [document.modalValueCount, document.evaluationLogs])

  return (
    <TableRow
      key={document.documentUuid}
      className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
      onClick={onSelect}
    >
      <TableCell className='nowrap max-w-[350px]'>
        {promptPath && (
          <>
            <Text.H4
              color='foregroundMuted'
              noWrap
              ellipsis
              wordBreak='breakAll'
            >
              {promptPath}
            </Text.H4>
            <Text.H4 color='foregroundMuted' noWrap>
              {'/'}
            </Text.H4>
          </>
        )}
        <Text.H4 noWrap>{promptName}</Text.H4>
      </TableCell>
      <TableCell>
        {isProjectsLoading ? (
          <Skeleton className='w-full h-4 bg-muted animate-pulse' />
        ) : (
          <Text.H4 noWrap>{projectName}</Text.H4>
        )}
      </TableCell>
      <TableCell>
        {document.evaluationLogs ? (
          <>
            <Text.H4 noWrap>{document.modalValue}</Text.H4>
            <div className='w-2'></div>
            <Text.H4 color='foregroundMuted' noWrap>
              ({modalValuePercentage}%)
            </Text.H4>
          </>
        ) : (
          <Text.H4 color='foregroundMuted'>—</Text.H4>
        )}
      </TableCell>
      <TableCell>
        <Text.H4 noWrap>{document.evaluationLogs}</Text.H4>
      </TableCell>
      <TableCell>
        <Text.H4 noWrap>{document.totalTokens}</Text.H4>
      </TableCell>
      <TableCell>
        <Text.H4 noWrap>
          {formatCostInMillicents(document.costInMillicents ?? 0)}
        </Text.H4>
      </TableCell>
    </TableRow>
  )
}

export default function ConnectedDocumentsTable({
  connectedDocumentsWithMetadata,
}: {
  connectedDocumentsWithMetadata: ConnectedDocumentWithMetadata[]
}) {
  const navigate = useNavigate()

  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Prompt name</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Modal value</TableHead>
          <TableHead>Logs evaluated</TableHead>
          <TableHead>Tokens</TableHead>
          <TableHead>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {connectedDocumentsWithMetadata.map((document) => (
          <ConnectedDocumentTableRow
            key={document.documentUuid}
            document={document}
            onSelect={() =>
              navigate.push(
                ROUTES.projects
                  .detail({ id: document.projectId })
                  .commits.detail({ uuid: HEAD_COMMIT })
                  .documents.detail({ uuid: document.documentUuid })
                  .evaluations.detail({ uuid: document.evaluationUuid }).root,
              )
            }
          />
        ))}
      </TableBody>
    </Table>
  )
}
