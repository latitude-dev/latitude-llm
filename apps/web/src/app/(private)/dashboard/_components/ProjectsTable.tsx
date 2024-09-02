'use client'

import { DocumentVersion, Project } from '@latitude-data/core/browser'
import {
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { getDocumentsFromMergedCommitsCache } from '../../_data-access'

export function ProjectsTable({
  documents,
  projects,
}: {
  documents: Awaited<ReturnType<typeof getDocumentsFromMergedCommitsCache>>
  projects: Project[]
}) {
  const navigate = useNavigate()
  const findDocuments = (projectId: number) =>
    documents.filter((d) => d.projectId === projectId)
  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Prompts</TableHead>
          <TableHead>Edited</TableHead>
          <TableHead>Created</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow
            key={project.id}
            verticalPadding
            className='cursor-pointer'
            onClick={() =>
              navigate.push(ROUTES.projects.detail({ id: project.id }).root)
            }
          >
            <TableCell>
              <Text.H4>{project.name}</Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {findDocuments(project.id).length || '-'}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {relativeTime(
                  findDocuments(project.id).sort(
                    (a: DocumentVersion, b: DocumentVersion) =>
                      b.updatedAt.getTime() - a.updatedAt.getTime(),
                  )?.[0]?.updatedAt,
                )}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 color='foregroundMuted'>
                {relativeTime(project.createdAt)}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Link
                href={ROUTES.dashboard.projects.destroy(project.id).root}
                onClick={(ev) => ev.stopPropagation()}
              >
                <Icons.trash />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
