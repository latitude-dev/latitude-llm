'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { ROUTES, BackofficeRoutes } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type SearchCardProps = {
  title: string
  description: string
  icon: string
  iconColor?: string
  bgColor: string
  inputIcon: string
  inputType: 'email' | 'number'
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  buttonText: string
}

function SearchCard({
  title,
  description,
  icon,
  iconColor = 'primary',
  bgColor,
  inputIcon,
  inputType,
  placeholder,
  value,
  onChange,
  onSearch,
  buttonText,
}: SearchCardProps) {
  return (
    <Card className='p-6 hover:shadow-lg transition-shadow duration-200'>
      <div className='space-y-6'>
        <div className='flex items-center space-x-4'>
          <div className={`p-3 ${bgColor} rounded-lg`}>
            <Icon name={icon as any} size='large' color={iconColor as any} />
          </div>
          <div className='flex flex-col'>
            <Text.H3>{title}</Text.H3>
            <Text.H5 color='foregroundMuted'>{description}</Text.H5>
          </div>
        </div>
        <div className='space-y-4'>
          <div className='relative'>
            <Icon
              name={inputIcon as any}
              size='normal'
              className='absolute left-3 top-1/2 transform -translate-y-1/2'
              color='foregroundMuted'
            />
            <Input
              type={inputType}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearch()
                }
              }}
              className='pl-10'
            />
          </div>
          <Button
            onClick={onSearch}
            disabled={!value.trim()}
            className='w-full'
            fancy
          >
            <Icon name='search' size='small' className='mr-2' />
            {buttonText}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function InfoSearchDashboard() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [projectId, setProjectId] = useState('')

  const handleWorkspaceSearch = () => {
    const id = parseInt(workspaceId.trim())
    if (!isNaN(id) && id > 0) {
      router.push(ROUTES.backoffice[BackofficeRoutes.search].workspace(id))
    }
  }

  const handleUserSearch = () => {
    const email = userEmail.trim()
    if (email) {
      router.push(ROUTES.backoffice[BackofficeRoutes.search].user(email))
    }
  }

  const handleProjectSearch = () => {
    const id = parseInt(projectId.trim())
    if (!isNaN(id) && id > 0) {
      router.push(ROUTES.backoffice[BackofficeRoutes.search].project(id))
    }
  }

  return (
    <div className='container mx-auto p-6 max-w-5xl'>
      <div className='space-y-8'>
        {/* Header Section */}
        <div className='flex flex-col gap-2'>
          <Text.H1>Admin Search</Text.H1>
          <Text.H4 color='foregroundMuted'>
            Search for workspaces, users, and projects to view detailed
            information and manage your system efficiently.
          </Text.H4>
        </div>

        {/* Search Cards Grid */}
        <div className='grid gap-6 md:grid-cols-1 lg:grid-cols-3'>
          <SearchCard
            title='User Search'
            description='Find user by email'
            icon='circleUser'
            bgColor='bg-blue-100 dark:bg-blue-900/30'
            inputIcon='mail'
            inputType='email'
            placeholder='Enter user email'
            value={userEmail}
            onChange={setUserEmail}
            onSearch={handleUserSearch}
            buttonText='Search User'
          />

          <SearchCard
            title='Workspace Search'
            description='Find workspace by ID'
            icon='house'
            bgColor='bg-green-100 dark:bg-green-900/30'
            inputIcon='aLargeSmall'
            inputType='number'
            placeholder='Enter workspace ID'
            value={workspaceId}
            onChange={setWorkspaceId}
            onSearch={handleWorkspaceSearch}
            buttonText='Search Workspace'
          />

          <SearchCard
            title='Project Search'
            description='Find project by ID'
            icon='folderOpen'
            iconColor='purple'
            bgColor='bg-purple-100 dark:bg-purple-900/30'
            inputIcon='aLargeSmall'
            inputType='number'
            placeholder='Enter project ID'
            value={projectId}
            onChange={setProjectId}
            onSearch={handleProjectSearch}
            buttonText='Search Project'
          />
        </div>

        {/* Quick Tips Section */}
        <Card className='p-6 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-dashed'>
          <div className='flex items-start space-x-4'>
            <div className='p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg'>
              <Icon name='lightBulb' size='medium' color='primary' />
            </div>
            <div className='space-y-2'>
              <Text.H4 weight='medium'>Quick Tips</Text.H4>
              <div className='flex flex-col'>
                <Text.H5 color='foregroundMuted'>
                  • Use exact email addresses for user searches
                </Text.H5>
                <Text.H5 color='foregroundMuted'>
                  • Workspace and project IDs are numeric values
                </Text.H5>
                <Text.H5 color='foregroundMuted'>
                  • Press Enter in any search field to execute the search
                </Text.H5>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
