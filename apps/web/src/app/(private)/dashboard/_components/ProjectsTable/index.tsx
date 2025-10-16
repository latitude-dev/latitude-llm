'use client'
import { useState } from 'react'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useNavigate } from '$/hooks/useNavigate'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'

import RenameProjectModal from './RenameProjectModal'
import { Project } from '@latitude-data/core/schema/types'
import { extractLeadingEmoji } from '@latitude-data/web-ui/textUtils'

function ProjectTitle({ name }: { name: string }) {
  const [emoji, title] = extractLeadingEmoji(name)

  return (
    <div className='flex items-center gap-2'>
      {emoji && (
        <div className='min-w-8 h-8 rounded-lg bg-muted flex items-center justify-center'>
          <Text.H3>{emoji}</Text.H3>
        </div>
      )}
      <Text.H5>{title}</Text.H5>
    </div>
  )
}

type ProjectWithAgreggatedData = Project & {
  lastEditedAt: Date | null
}
export function ProjectsTable({
  projects,
}: {
  projects: ProjectWithAgreggatedData[]
}) {
  const navigate = useNavigate()
  const [projectToRename, setProjectToRename] = useState<Project | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
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
                <ProjectTitle name={project.name} />
              </TableCell>
              <TableCell>
                <Text.H5 color='foregroundMuted'>
                  {relativeTime(project.lastEditedAt)}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 color='foregroundMuted'>
                  {relativeTime(project.createdAt)}
                </Text.H5>
              </TableCell>
              <TableCell>
                <DropdownMenu
                  options={[
                    {
                      label: 'Rename',
                      onClick: () => {
                        setProjectToRename(project)
                      },
                      onElementClick: (e) => {
                        e.stopPropagation()
                      },
                    },
                    {
                      label: 'Delete',
                      type: 'destructive',
                      onElementClick(e) {
                        e.stopPropagation()
                      },
                      onClick: () => {
                        navigate.push(
                          ROUTES.dashboard.projects.destroy(project.id).root,
                        )
                      },
                    },
                  ]}
                  side='bottom'
                  align='end'
                  triggerButtonProps={{
                    className: 'border-none justify-end cursor-pointer',
                    onClick: (e) => e.stopPropagation(),
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {projectToRename && (
        <RenameProjectModal
          project={projectToRename}
          onClose={() => setProjectToRename(null)}
        />
      )}
    </>
  )
}
