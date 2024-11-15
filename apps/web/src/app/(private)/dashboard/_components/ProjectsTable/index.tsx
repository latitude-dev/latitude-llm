'use client'

import { Project } from '@latitude-data/core/browser'
import {
  Icon,
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

type ProjectWithAgreggatedData = Project & {
  documentCount: number
  lastCreatedAtDocument: Date | null
}
export function ProjectsTable({
  projects,
}: {
  projects: ProjectWithAgreggatedData[]
}) {
  const navigate = useNavigate()
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
              <Text.H5>{project.name}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {project.documentCount || '-'}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(project.lastCreatedAtDocument)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color='foregroundMuted'>
                {relativeTime(project.createdAt)}
              </Text.H5>
            </TableCell>
            <TableCell>
              <Link
                href={ROUTES.dashboard.projects.destroy(project.id).root}
                onClick={(ev) => ev.stopPropagation()}
              >
                <Icon name='trash' />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
