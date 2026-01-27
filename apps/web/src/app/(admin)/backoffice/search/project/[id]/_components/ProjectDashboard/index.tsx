'use client'
import Link from 'next/link'
import { useEffect } from 'react'

import { ProjectWithDetails } from '$/data-access'
import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { DashboardHeader } from '$/app/(admin)/backoffice/search/_components/DashboardHeader'
import { BasicInfoList } from '$/app/(admin)/backoffice/search/_components/BasicInfoList'
import { useRecentSearches } from '$/app/(admin)/backoffice/search/_hooks/useRecentSearches'

type Props = {
  project: ProjectWithDetails
}

export function ProjectDashboard({ project }: Props) {
  const { addRecentItem } = useRecentSearches()

  useEffect(() => {
    addRecentItem({
      type: 'project',
      id: project.id,
      label: project.name,
      sublabel: `#${project.id}`,
    })
  }, [project.id, project.name, addRecentItem])
  const basicInfo = [
    {
      label: 'Project ID',
      value: project.id,
      monospace: true,
      icon: 'aLargeSmall' as const,
    },
    {
      label: 'Project Name',
      value: project.name,
      icon: 'folderOpen' as const,
    },
  ]

  const breadcrumbs = [{ label: 'Project', href: undefined }]

  return (
    <div className='container mx-auto p-6 max-w-6xl'>
      <div className='space-y-8'>
        <DashboardHeader
          title={project.name}
          description={`Detailed information about project #${project.id}`}
          icon='folderOpen'
          breadcrumbs={breadcrumbs}
        />

        <BasicInfoList items={basicInfo} title='Project Information' />

        {/* Workspace Info Card */}
        <Card className='p-6'>
          <div className='flex items-center space-x-3 mb-6'>
            <Icon name='house' size='medium' color='primary' />
            <Text.H3>Associated Workspace</Text.H3>
          </div>
          <div className='flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors'>
            <div className='flex items-center space-x-4'>
              <div className='p-3 bg-accent rounded-lg'>
                <Icon name='house' size='large' color='primary' />
              </div>
              <div className='flex gap-2 items-center'>
                <Text.H5 color='foregroundMuted' monospace>
                  {project.workspace.id}
                </Text.H5>
                <Text.H5 weight='medium'>{project.workspace.name}</Text.H5>
              </div>
            </div>
            <Link
              href={ROUTES.backoffice[BackofficeRoutes.search].workspace(
                project.workspace.id,
              )}
            >
              <Button
                fancy
                variant='outline'
                className='flex items-center space-x-2'
              >
                <Text.H6B noWrap>View Workspace</Text.H6B>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
